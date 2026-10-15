import type {
  CreateJobRequest,
  CreateJobResponse,
  JobResponse,
  RenderVideoParams,
  WorkerJobUpdate,
} from '@sur/shared-types';

export type JobErrorCode =
  | 'TAKE_NOT_FOUND'
  | 'TAKE_NOT_CLOUD_READY'
  | 'STEMS_NOT_SHAREABLE'
  | 'JOB_NOT_FOUND'
  | 'INVALID_JOB_TRANSITION';

export class JobError extends Error {
  constructor(
    readonly code: JobErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'JobError';
  }
}

export interface RenderableTake {
  readonly id: string;
  readonly ownerId: string;
  readonly audioObjectKey: string | null;
  readonly containsThirdPartyStems: boolean;
}

export interface JobRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly takeId: string;
  readonly type: 'render_video';
  readonly params: RenderVideoParams;
  readonly inputKeys: readonly string[];
  readonly status: JobResponse['status'];
  readonly progress: number;
  readonly outputKeys: JobOutputKeys | null;
  readonly error: JobResponse['error'];
  readonly createdAt: Date;
}

export interface JobOutputKeys {
  readonly videoObjectKey: string;
  readonly posterObjectKey: string | null;
}

export interface TakeJobCatalog {
  findOwned(takeId: string, ownerId: string): Promise<RenderableTake | null>;
}

/**
 * Production implementations commit the record and durable queue/outbox message atomically.
 * This prevents a persisted queued job from being silently lost between two writes.
 */
export interface JobSubmissionStore {
  submit(record: JobRecord): Promise<void>;
  findOwned(jobId: string, ownerId: string): Promise<JobRecord | null>;
  applyWorkerUpdate(jobId: string, update: WorkerJobUpdate): Promise<JobUpdateResult>;
}

export type JobUpdateResult = 'updated' | 'duplicate' | 'not_found' | 'conflict';

export interface JobOutputUrlResolver {
  resolve(keys: JobOutputKeys): Promise<NonNullable<JobResponse['outputs']>>;
}

export interface JobServiceDependencies {
  readonly takes: TakeJobCatalog;
  readonly submissions: JobSubmissionStore;
  readonly nextId: () => string;
  readonly now: () => Date;
  readonly outputUrls: JobOutputUrlResolver;
}

export class JobService {
  constructor(private readonly dependencies: JobServiceDependencies) {}

  async create(ownerId: string, input: CreateJobRequest): Promise<CreateJobResponse> {
    const take = await this.dependencies.takes.findOwned(input.takeId, ownerId);
    if (!take) throw new JobError('TAKE_NOT_FOUND', 'Take was not found');
    if (take.containsThirdPartyStems) {
      throw new JobError('STEMS_NOT_SHAREABLE', 'Third-party stems cannot be rendered');
    }
    if (!take.audioObjectKey) {
      throw new JobError('TAKE_NOT_CLOUD_READY', 'Save the mixed track before rendering');
    }

    const id = this.dependencies.nextId();
    await this.dependencies.submissions.submit({
      id,
      ownerId,
      takeId: take.id,
      type: 'render_video',
      params: input.params,
      inputKeys: [take.audioObjectKey],
      status: 'queued',
      progress: 0,
      outputKeys: null,
      error: null,
      createdAt: this.dependencies.now(),
    });
    return { id, status: 'queued' };
  }

  async get(ownerId: string, jobId: string): Promise<JobResponse> {
    const job = await this.dependencies.submissions.findOwned(jobId, ownerId);
    if (!job) throw new JobError('JOB_NOT_FOUND', 'Job was not found');
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      outputs: job.outputKeys ? await this.dependencies.outputUrls.resolve(job.outputKeys) : null,
      error: job.error,
    };
  }

  async updateFromWorker(jobId: string, update: WorkerJobUpdate): Promise<void> {
    const result = await this.dependencies.submissions.applyWorkerUpdate(jobId, update);
    if (result === 'not_found') throw new JobError('JOB_NOT_FOUND', 'Job was not found');
    if (result === 'conflict') {
      throw new JobError('INVALID_JOB_TRANSITION', 'Job update conflicts with its current state');
    }
  }
}
