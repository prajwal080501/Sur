import type { Collection, MongoClient } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import type { JobRecord } from '@sur/job-domain';
import { MongoJobSubmissionStore, type JobOutboxDocument } from './mongo-job-submission-store.js';

interface StoredJob extends Omit<JobRecord, 'id'> {
  readonly _id: string;
}

const job: JobRecord = {
  id: 'job-1',
  ownerId: 'user-1',
  takeId: 'take-1',
  type: 'render_video',
  params: {
    aspect: '9:16',
    durationMs: 60_000,
    startMs: 0,
    title: 'Morning riyaz',
    background: 'gradient-1',
    showChords: true,
  },
  inputKeys: ['private/user-1/take-1/mix.mp3'],
  status: 'queued',
  progress: 0,
  outputKeys: null,
  error: null,
  createdAt: new Date('2026-10-15T10:00:00.000Z'),
};

describe('MongoJobSubmissionStore', () => {
  it('writes the job and deterministic outbox record in one transaction session', async () => {
    const session = {
      withTransaction: vi.fn(async (work: () => Promise<void>) => work()),
      endSession: vi.fn(() => Promise.resolve()),
    };
    const client = { startSession: vi.fn(() => session) } as unknown as MongoClient;
    const insertJob = vi.fn(() => Promise.resolve({ acknowledged: true, insertedId: 'job-1' }));
    const insertOutbox = vi.fn((document: JobOutboxDocument, options?: unknown) => {
      void document;
      void options;
      return Promise.resolve({ acknowledged: true, insertedId: 'job:job-1' });
    });
    const jobs = {
      insertOne: insertJob,
      findOne: vi.fn(),
    } as unknown as Collection<StoredJob>;
    const outbox = { insertOne: insertOutbox } as unknown as Collection<JobOutboxDocument>;
    session.withTransaction.mockImplementationOnce(async (work) => {
      await work();
    });
    const store = new MongoJobSubmissionStore(client, jobs, outbox);

    await store.submit(job);

    expect(session.withTransaction).toHaveBeenCalledTimes(1);
    expect(insertJob).toHaveBeenCalledWith(expect.objectContaining({ _id: 'job-1' }), {
      session,
    });
    expect(insertOutbox).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'job:job-1',
        kind: 'render_video.requested',
        jobId: 'job-1',
        publishedAt: null,
      }),
      { session },
    );
    expect(insertOutbox.mock.calls[0]?.[0].payload.policy).toEqual({
      containsThirdPartyStems: false,
      freeTier: true,
    });
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('always ends the session when a transactional write fails', async () => {
    const session = {
      withTransaction: vi.fn(() => Promise.reject(new Error('outbox unavailable'))),
      endSession: vi.fn(() => Promise.resolve()),
    };
    const client = { startSession: vi.fn(() => session) } as unknown as MongoClient;
    const store = new MongoJobSubmissionStore(
      client,
      {} as Collection<StoredJob>,
      {} as Collection<JobOutboxDocument>,
    );
    await expect(store.submit(job)).rejects.toThrow('outbox unavailable');
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('atomically applies a worker completion and treats terminal retries as duplicates', async () => {
    const session = {
      withTransaction: vi.fn(),
      endSession: vi.fn(() => Promise.resolve()),
    };
    const client = { startSession: vi.fn(() => session) } as unknown as MongoClient;
    let updateCount = 0;
    const updateOne = vi.fn((filter: unknown, updateDocument: unknown) => {
      void filter;
      void updateDocument;
      updateCount += 1;
      return Promise.resolve({ matchedCount: updateCount === 1 ? 1 : 0 });
    });
    const findOne = vi.fn(() => Promise.resolve({ ...job, _id: job.id, status: 'done' }));
    const jobs = { updateOne, findOne } as unknown as Collection<StoredJob>;
    const store = new MongoJobSubmissionStore(client, jobs, {} as Collection<JobOutboxDocument>);
    const update = {
      status: 'done' as const,
      progress: 100 as const,
      output: { videoObjectKey: 'renders/job-1/video.mp4' },
      metrics: { elapsedMs: 321, reused: false },
    };

    await expect(store.applyWorkerUpdate('job-1', update)).resolves.toBe('updated');
    expect(updateOne.mock.calls[0]?.[0]).toEqual({
      _id: 'job-1',
      status: { $in: ['queued', 'processing'] },
    });
    expect(updateOne.mock.calls[0]?.[1]).toEqual({
      $set: {
        status: 'done',
        progress: 100,
        outputKeys: { videoObjectKey: 'renders/job-1/video.mp4', posterObjectKey: null },
        error: null,
      },
    });
    await expect(store.applyWorkerUpdate('job-1', update)).resolves.toBe('duplicate');
  });
});
