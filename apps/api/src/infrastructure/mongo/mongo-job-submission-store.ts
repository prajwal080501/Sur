import type { JobRecord, JobSubmissionStore, JobUpdateResult } from '@sur/job-domain';
import type { WorkerJobUpdate } from '@sur/shared-types';
import type { Collection, MongoClient } from 'mongodb';

export interface JobDocument extends Omit<JobRecord, 'id'> {
  readonly _id: string;
}

export interface JobOutboxDocument {
  readonly _id: string;
  readonly kind: 'render_video.requested';
  readonly jobId: string;
  readonly payload: {
    readonly inputKeys: readonly string[];
    readonly params: JobRecord['params'];
    readonly policy: {
      readonly containsThirdPartyStems: false;
      readonly freeTier: true;
    };
  };
  readonly createdAt: Date;
  readonly publishedAt: Date | null;
  readonly attempts: number;
  readonly lockedUntil: Date | null;
  readonly lastError: string | null;
}

function toRecord(document: JobDocument): JobRecord {
  return {
    id: document._id,
    ownerId: document.ownerId,
    takeId: document.takeId,
    type: document.type,
    params: document.params,
    inputKeys: document.inputKeys,
    status: document.status,
    progress: document.progress,
    outputKeys: document.outputKeys,
    error: document.error,
    createdAt: document.createdAt,
  };
}

export class MongoJobSubmissionStore implements JobSubmissionStore {
  constructor(
    private readonly client: MongoClient,
    private readonly jobs: Collection<JobDocument>,
    private readonly outbox: Collection<JobOutboxDocument>,
  ) {}

  async submit(record: JobRecord): Promise<void> {
    const session = this.client.startSession();
    try {
      await session.withTransaction(
        async () => {
          await this.jobs.insertOne(
            {
              _id: record.id,
              ownerId: record.ownerId,
              takeId: record.takeId,
              type: record.type,
              params: record.params,
              inputKeys: record.inputKeys,
              status: record.status,
              progress: record.progress,
              outputKeys: record.outputKeys,
              error: record.error,
              createdAt: record.createdAt,
            },
            { session },
          );
          await this.outbox.insertOne(
            {
              _id: `job:${record.id}`,
              kind: 'render_video.requested',
              jobId: record.id,
              payload: {
                inputKeys: record.inputKeys,
                params: record.params,
                policy: { containsThirdPartyStems: false, freeTier: true },
              },
              createdAt: record.createdAt,
              publishedAt: null,
              attempts: 0,
              lockedUntil: null,
              lastError: null,
            },
            { session },
          );
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
        },
      );
    } finally {
      await session.endSession();
    }
  }

  async findOwned(jobId: string, ownerId: string): Promise<JobRecord | null> {
    const document = await this.jobs.findOne({ _id: jobId, ownerId });
    return document ? toRecord(document) : null;
  }

  async applyWorkerUpdate(jobId: string, update: WorkerJobUpdate): Promise<JobUpdateResult> {
    const fields =
      update.status === 'processing'
        ? { status: update.status, progress: update.progress }
        : update.status === 'done'
          ? {
              status: update.status,
              progress: 100,
              outputKeys: {
                videoObjectKey: update.output.videoObjectKey,
                posterObjectKey: null,
              },
              error: null,
            }
          : {
              status: update.status,
              progress: 0,
              error: update.error,
            };
    const result = await this.jobs.updateOne(
      { _id: jobId, status: { $in: ['queued', 'processing'] } },
      { $set: fields },
    );
    if (result.matchedCount > 0) return 'updated';
    const existing = await this.jobs.findOne({ _id: jobId });
    if (!existing) return 'not_found';
    if (['done', 'failed', 'cancelled'].includes(existing.status)) return 'duplicate';
    return 'conflict';
  }
}
