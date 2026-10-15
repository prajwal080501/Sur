import type { WorkerJobUpdate } from '@sur/shared-types';
import type { JobRecord, JobSubmissionStore, JobUpdateResult } from './job-service.js';

export class InMemoryJobSubmissionStore implements JobSubmissionStore {
  readonly #records = new Map<string, JobRecord>();

  submit(record: JobRecord): Promise<void> {
    if (this.#records.has(record.id)) return Promise.reject(new Error('Duplicate job id'));
    this.#records.set(record.id, record);
    return Promise.resolve();
  }

  findOwned(jobId: string, ownerId: string): Promise<JobRecord | null> {
    const job = this.#records.get(jobId);
    return Promise.resolve(job?.ownerId === ownerId ? job : null);
  }

  applyWorkerUpdate(jobId: string, update: WorkerJobUpdate): Promise<JobUpdateResult> {
    const job = this.#records.get(jobId);
    if (!job) return Promise.resolve('not_found');
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      return Promise.resolve('duplicate');
    }
    if (update.status === 'processing') {
      this.#records.set(jobId, { ...job, status: 'processing', progress: update.progress });
    } else if (update.status === 'done') {
      this.#records.set(jobId, {
        ...job,
        status: 'done',
        progress: 100,
        outputKeys: { videoObjectKey: update.output.videoObjectKey, posterObjectKey: null },
        error: null,
      });
    } else {
      this.#records.set(jobId, {
        ...job,
        status: 'failed',
        progress: 0,
        error: update.error,
      });
    }
    return Promise.resolve('updated');
  }
}
