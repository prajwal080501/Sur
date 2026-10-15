import type { CreateJobRequest } from '@sur/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryJobSubmissionStore } from './in-memory-job-submission-store.js';
import { JobService, type RenderableTake, type TakeJobCatalog } from './job-service.js';

const request: CreateJobRequest = {
  type: 'render_video',
  takeId: 'take-1',
  params: {
    aspect: '9:16',
    durationMs: 60_000,
    startMs: 30_000,
    title: 'Morning riyaz',
    background: 'gradient-1',
    showChords: true,
  },
};

function setup(overrides: Partial<RenderableTake> = {}) {
  const take: RenderableTake = {
    id: 'take-1',
    ownerId: 'user-1',
    audioObjectKey: 'private/user-1/take-1/mix.mp3',
    containsThirdPartyStems: false,
    ...overrides,
  };
  const takes: TakeJobCatalog = {
    findOwned: vi.fn((takeId, ownerId) =>
      Promise.resolve(takeId === take.id && ownerId === take.ownerId ? take : null),
    ),
  };
  const submissions = new InMemoryJobSubmissionStore();
  const service = new JobService({
    takes,
    submissions,
    nextId: () => 'job-1',
    now: () => new Date('2026-10-15T00:00:00.000Z'),
    outputUrls: {
      resolve: ({ videoObjectKey }) =>
        Promise.resolve({ videoUrl: `https://media.example/${videoObjectKey}`, posterUrl: null }),
    },
  });
  return { service, submissions };
}

describe('JobService', () => {
  it('atomically submits a cloud-ready render job and returns its status', async () => {
    const { service } = setup();
    await expect(service.create('user-1', request)).resolves.toEqual({
      id: 'job-1',
      status: 'queued',
    });
    await expect(service.get('user-1', 'job-1')).resolves.toMatchObject({
      id: 'job-1',
      type: 'render_video',
      status: 'queued',
      progress: 0,
    });
  });

  it("does not reveal another owner's take or job", async () => {
    const { service } = setup();
    await expect(service.create('user-2', request)).rejects.toMatchObject({
      code: 'TAKE_NOT_FOUND',
    });
    await service.create('user-1', request);
    await expect(service.get('user-2', 'job-1')).rejects.toMatchObject({
      code: 'JOB_NOT_FOUND',
    });
  });

  it('rejects local-only takes before submission', async () => {
    const { service, submissions } = setup({ audioObjectKey: null });
    const submit = vi.spyOn(submissions, 'submit');
    await expect(service.create('user-1', request)).rejects.toMatchObject({
      code: 'TAKE_NOT_CLOUD_READY',
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('blocks rendering when a take contains third-party stems', async () => {
    const { service, submissions } = setup({ containsThirdPartyStems: true });
    const submit = vi.spyOn(submissions, 'submit');
    await expect(service.create('user-1', request)).rejects.toMatchObject({
      code: 'STEMS_NOT_SHAREABLE',
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('applies idempotent worker progress and resolves private output keys at read time', async () => {
    const { service } = setup();
    await service.create('user-1', request);
    await service.updateFromWorker('job-1', { status: 'processing', progress: 5 });
    await service.updateFromWorker('job-1', {
      status: 'done',
      progress: 100,
      output: { videoObjectKey: 'renders/job-1/video.mp4' },
      metrics: { elapsedMs: 321, reused: false },
    });
    await service.updateFromWorker('job-1', { status: 'processing', progress: 5 });
    await expect(service.get('user-1', 'job-1')).resolves.toMatchObject({
      status: 'done',
      progress: 100,
      outputs: { videoUrl: 'https://media.example/renders/job-1/video.mp4' },
    });
  });
});
