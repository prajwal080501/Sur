import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { CreateQueueCommand, ReceiveMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { LocalstackContainer, type StartedLocalStackContainer } from '@testcontainers/localstack';
import type { JobRecord } from '@sur/job-domain';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MongoJobSubmissionStore,
  type JobDocument,
  type JobOutboxDocument,
} from '../infrastructure/mongo/mongo-job-submission-store.js';
import { S3PublicShareMediaStore } from '../infrastructure/s3/s3-public-share-media-store.js';
import { SqsJobQueuePublisher } from '../infrastructure/sqs/sqs-job-queue-publisher.js';

const region = 'ap-south-1';
const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
const bucket = 'sur-integration-media';

const job: JobRecord = {
  id: 'job-1',
  ownerId: 'user-1',
  takeId: 'take-1',
  type: 'render_video',
  params: {
    aspect: '9:16',
    durationMs: 1_000,
    startMs: 0,
    title: 'Integration riyaz',
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

describe('disposable cloud adapters', () => {
  let replicaSet: MongoMemoryReplSet;
  let mongo: MongoClient;
  let localstack: StartedLocalStackContainer;
  let s3: S3Client;
  let sqs: SQSClient;

  beforeAll(async () => {
    [replicaSet, localstack] = await Promise.all([
      MongoMemoryReplSet.create({
        binary: {
          version: '8.0.15',
          downloadDir: process.env.MONGOMS_DOWNLOAD_DIR ?? '/tmp/sur-mongodb-binaries',
        },
        replSet: { count: 1, storageEngine: 'wiredTiger' },
      }),
      new LocalstackContainer('localstack/localstack:3.8.1')
        .withEnvironment({ SERVICES: 's3,sqs', SQS_ENDPOINT_STRATEGY: 'path' })
        .start(),
    ]);
    mongo = new MongoClient(replicaSet.getUri());
    await mongo.connect();
    const endpoint = localstack.getConnectionUri();
    s3 = new S3Client({ endpoint, forcePathStyle: true, region, credentials });
    sqs = new SQSClient({ endpoint, region, credentials });
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }, 120_000);

  afterAll(async () => {
    s3?.destroy();
    sqs?.destroy();
    await mongo?.close();
    await Promise.all([replicaSet?.stop(), localstack?.stop()]);
  });

  it('commits jobs and outbox events atomically in a real replica-set transaction', async () => {
    const database = mongo.db('sur_integration');
    const jobs = database.collection<JobDocument>('jobs');
    const outbox = database.collection<JobOutboxDocument>('job_outbox');
    const store = new MongoJobSubmissionStore(mongo, jobs, outbox);

    await store.submit(job);
    await expect(jobs.findOne({ _id: job.id })).resolves.toMatchObject({
      status: 'queued',
      outputKeys: null,
    });
    await expect(outbox.findOne({ _id: `job:${job.id}` })).resolves.toMatchObject({
      kind: 'render_video.requested',
      payload: { policy: { containsThirdPartyStems: false, freeTier: true } },
    });

    await outbox.insertOne({
      _id: 'job:job-rollback',
      kind: 'render_video.requested',
      jobId: 'occupied',
      payload: {
        inputKeys: job.inputKeys,
        params: job.params,
        policy: { containsThirdPartyStems: false, freeTier: true },
      },
      createdAt: job.createdAt,
      publishedAt: null,
      attempts: 0,
      lockedUntil: null,
      lastError: null,
    });
    await expect(store.submit({ ...job, id: 'job-rollback' })).rejects.toThrow();
    await expect(jobs.findOne({ _id: 'job-rollback' })).resolves.toBeNull();
  });

  it('copies and revokes public media through an S3-compatible service', async () => {
    await Promise.all([
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: 'private/user-1/take-1/mix.mp3',
          Body: 'audio',
        }),
      ),
      s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: 'private/user-1/take-1/video.mp4',
          Body: 'video',
        }),
      ),
    ]);
    const media = new S3PublicShareMediaStore(s3, bucket, 'https://media.example/');
    const published = await media.publish({
      slug: 'share-1',
      audioObjectKey: 'private/user-1/take-1/mix.mp3',
      videoObjectKey: 'private/user-1/take-1/video.mp4',
    });
    expect(published).toEqual({
      audioUrl: 'https://media.example/public-shares/share-1/audio.mp3',
      videoUrl: 'https://media.example/public-shares/share-1/video.mp4',
    });
    const audio = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: 'public-shares/share-1/audio.mp3' }),
    );
    await expect(audio.Body?.transformToString()).resolves.toBe('audio');

    await media.remove('share-1');
    await expect(
      s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'public-shares/share-1/audio.mp3' })),
    ).rejects.toThrow();
  });

  it('publishes the stable job envelope through an SQS-compatible service', async () => {
    const created = await sqs.send(new CreateQueueCommand({ QueueName: 'sur-jobs' }));
    const queueUrl = created.QueueUrl;
    if (!queueUrl) throw new Error('LocalStack did not return a queue URL');
    const publisher = new SqsJobQueuePublisher(sqs, queueUrl, {
      allowInsecureLocalhost: true,
    });
    await publisher.publish({
      id: 'job:job-1',
      kind: 'render_video.requested',
      jobId: 'job-1',
      payload: { inputKeys: job.inputKeys, params: job.params },
      attempts: 1,
    });
    const response = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 1 }),
    );
    const body = response.Messages?.[0]?.Body;
    expect(body ? (JSON.parse(body) as unknown) : null).toMatchObject({
      id: 'job:job-1',
      type: 'render_video.requested',
      jobId: 'job-1',
    });
  });
});
