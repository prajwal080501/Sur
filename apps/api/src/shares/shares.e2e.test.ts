import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import type { ShareableTake } from '@sur/share-domain';
import {
  createJobResponseSchema,
  createShareResponseSchema,
  jobResponseSchema,
  publicShareSchema,
} from '@sur/shared-types';
import type { Server } from 'node:http';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApplication } from '../app.js';
import type { InMemoryTakeShareCatalog } from './local-share.adapters.js';
import { TAKE_SHARE_CATALOG } from './share.tokens.js';

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown(),
  }),
});
const workerCallbackSecret = 'test-worker-callback-secret-32-bytes';

function parseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

const shareRequest = {
  takeId: 'take-1',
  visibility: 'unlisted',
  includeVideo: true,
  expiresAt: null,
};

const jobRequest = {
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

function take(overrides: Partial<ShareableTake> = {}): ShareableTake {
  return {
    id: 'take-1',
    ownerId: 'user-1',
    title: 'Morning riyaz',
    singer: 'Asha',
    key: 'A minor',
    tempoBpm: 90,
    chords: [],
    audioObjectKey: 'private/user-1/take-1/mix.mp3',
    videoObjectKey: 'private/user-1/take-1/video.mp4',
    containsThirdPartyStems: false,
    ...overrides,
  };
}

describe('share HTTP API', () => {
  let app: INestApplication;
  let server: Server;
  let takes: InMemoryTakeShareCatalog;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.WORKER_CALLBACK_SECRET = workerCallbackSecret;
    app = await createApplication();
    server = app.getHttpServer() as Server;
    takes = app.get<InMemoryTakeShareCatalog>(TAKE_SHARE_CATALOG);
    takes.upsert(take());
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires the development bearer token for mutations', async () => {
    const response = await request(server).post('/api/v1/shares').send(shareRequest);
    expect(response.status).toBe(401);
    expect(parseJson(response.text)).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'A valid bearer token is required',
        details: {},
      },
    });
  });

  it('returns shared zod validation failures in the standard envelope', async () => {
    const response = await request(server)
      .post('/api/v1/shares')
      .set('Authorization', 'Bearer dev-user-1')
      .send({ ...shareRequest, takeId: '' });
    expect(response.status).toBe(400);
    const error = errorEnvelopeSchema.parse(parseJson(response.text));
    expect(error.error.code).toBe('VALIDATION_ERROR');
    const details = z
      .object({ issues: z.array(z.object({ path: z.string(), message: z.string() })) })
      .parse(error.error.details);
    expect(details.issues.some((issue) => issue.path === 'takeId')).toBe(true);
  });

  it('creates, resolves, ownership-checks, and revokes a share', async () => {
    const createdResponse = await request(server)
      .post('/api/v1/shares')
      .set('Authorization', 'Bearer dev-user-1')
      .send(shareRequest);
    expect(createdResponse.status).toBe(201);
    const created = createShareResponseSchema.parse(parseJson(createdResponse.text));
    expect(created.slug).toMatch(/^[A-Za-z0-9_-]{12}$/);

    const resolvedResponse = await request(server).get(`/api/v1/public/shares/${created.slug}`);
    expect(resolvedResponse.status).toBe(200);
    const resolved = publicShareSchema.parse(parseJson(resolvedResponse.text));
    expect(resolved).toMatchObject({ title: 'Morning riyaz', singer: 'Asha' });

    const wrongOwner = await request(server)
      .delete(`/api/v1/shares/${created.slug}`)
      .set('Authorization', 'Bearer dev-user-2');
    expect(wrongOwner.status).toBe(404);

    const revoked = await request(server)
      .delete(`/api/v1/shares/${created.slug}`)
      .set('Authorization', 'Bearer dev-user-1');
    expect(revoked.status).toBe(204);

    const gone = await request(server).get(`/api/v1/public/shares/${created.slug}`);
    expect(gone.status).toBe(410);
    expect(errorEnvelopeSchema.parse(parseJson(gone.text)).error.code).toBe('SHARE_GONE');
  });

  it('maps the third-party stem policy to 403', async () => {
    takes.upsert(take({ id: 'take-stems', containsThirdPartyStems: true }));
    const response = await request(server)
      .post('/api/v1/shares')
      .set('Authorization', 'Bearer dev-user-1')
      .send({ ...shareRequest, takeId: 'take-stems' });
    expect(response.status).toBe(403);
    expect(errorEnvelopeSchema.parse(parseJson(response.text)).error.code).toBe(
      'STEMS_NOT_SHAREABLE',
    );
  });

  it('submits and ownership-checks a validated render-video job', async () => {
    const createdResponse = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', 'Bearer dev-user-1')
      .send(jobRequest);
    expect(createdResponse.status).toBe(201);
    const created = createJobResponseSchema.parse(parseJson(createdResponse.text));

    const jobResponse = await request(server)
      .get(`/api/v1/jobs/${created.id}`)
      .set('Authorization', 'Bearer dev-user-1');
    expect(jobResponse.status).toBe(200);
    expect(jobResponseSchema.parse(parseJson(jobResponse.text))).toMatchObject({
      id: created.id,
      type: 'render_video',
      status: 'queued',
      progress: 0,
    });

    const callbackBody = JSON.stringify({
      status: 'done',
      progress: 100,
      output: { videoObjectKey: `renders/${created.id}/video.mp4` },
      metrics: { elapsedMs: 321, reused: false },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', workerCallbackSecret)
      .update(`${timestamp}.${callbackBody}`)
      .digest('hex');
    const rejectedCallback = await request(server)
      .post(`/api/v1/internal/jobs/${created.id}/status`)
      .set('Content-Type', 'application/json')
      .set('X-Sur-Timestamp', timestamp)
      .set('X-Sur-Signature', `sha256=${'0'.repeat(64)}`)
      .send(callbackBody);
    expect(rejectedCallback.status).toBe(401);

    const callback = await request(server)
      .post(`/api/v1/internal/jobs/${created.id}/status`)
      .set('Content-Type', 'application/json')
      .set('X-Sur-Timestamp', timestamp)
      .set('X-Sur-Signature', `sha256=${signature}`)
      .send(callbackBody);
    expect(callback.status).toBe(204);
    const replay = await request(server)
      .post(`/api/v1/internal/jobs/${created.id}/status`)
      .set('Content-Type', 'application/json')
      .set('X-Sur-Timestamp', timestamp)
      .set('X-Sur-Signature', `sha256=${signature}`)
      .send(callbackBody);
    expect(replay.status).toBe(204);

    const completedResponse = await request(server)
      .get(`/api/v1/jobs/${created.id}`)
      .set('Authorization', 'Bearer dev-user-1');
    expect(jobResponseSchema.parse(parseJson(completedResponse.text))).toMatchObject({
      status: 'done',
      progress: 100,
      outputs: { posterUrl: null },
    });

    const hidden = await request(server)
      .get(`/api/v1/jobs/${created.id}`)
      .set('Authorization', 'Bearer dev-user-2');
    expect(hidden.status).toBe(404);
  });

  it('validates render bounds and blocks third-party stems at the job boundary', async () => {
    const invalid = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', 'Bearer dev-user-1')
      .send({
        ...jobRequest,
        params: { ...jobRequest.params, durationMs: 60_001 },
      });
    expect(invalid.status).toBe(400);

    const blocked = await request(server)
      .post('/api/v1/jobs')
      .set('Authorization', 'Bearer dev-user-1')
      .send({ ...jobRequest, takeId: 'take-stems' });
    expect(blocked.status).toBe(403);
    expect(errorEnvelopeSchema.parse(parseJson(blocked.text)).error.code).toBe(
      'STEMS_NOT_SHAREABLE',
    );
  });
});
