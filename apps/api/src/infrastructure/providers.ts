import { S3Client } from '@aws-sdk/client-s3';
import { SQSClient } from '@aws-sdk/client-sqs';
import { Logger, type Provider } from '@nestjs/common';
import { InMemoryJobSubmissionStore } from '@sur/job-domain';
import { InMemoryShareRepository } from '@sur/share-domain';
import { MongoClient } from 'mongodb';
import {
  JOB_OUTPUT_URL_RESOLVER,
  JOB_SUBMISSION_STORE,
  TAKE_JOB_CATALOG,
} from '../jobs/job.tokens.js';
import { LocalJobOutputUrlResolver } from '../jobs/local-job-output-url-resolver.js';
import {
  InMemoryTakeShareCatalog,
  LocalPublicShareMediaStore,
} from '../shares/local-share.adapters.js';
import {
  PUBLIC_SHARE_MEDIA_STORE,
  SHARE_REPOSITORY,
  TAKE_SHARE_CATALOG,
} from '../shares/share.tokens.js';
import {
  MongoJobSubmissionStore,
  type JobOutboxDocument,
} from './mongo/mongo-job-submission-store.js';
import { MongoOutboxStore } from './mongo/mongo-outbox-store.js';
import { MongoShareRepository } from './mongo/mongo-share-repository.js';
import { MongoTakePublicationCatalog } from './mongo/mongo-take-publication-catalog.js';
import { OutboxDispatcher } from './outbox/outbox-dispatcher.js';
import { S3PublicShareMediaStore } from './s3/s3-public-share-media-store.js';
import { S3JobOutputUrlResolver } from './s3/s3-job-output-url-resolver.js';
import { SqsJobQueuePublisher } from './sqs/sqs-job-queue-publisher.js';

const CLOUD_RESOURCES = Symbol('CLOUD_RESOURCES');
const logger = new Logger('OutboxDispatcher');

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when SUR_ADAPTER_MODE=cloud`);
  return value;
}

export function createInfrastructureProviders(): Provider[] {
  const mode = process.env.SUR_ADAPTER_MODE ?? 'memory';
  if (process.env.NODE_ENV === 'production' && mode !== 'cloud') {
    throw new Error('Production requires SUR_ADAPTER_MODE=cloud');
  }
  if (mode === 'memory') {
    return [
      { provide: TAKE_SHARE_CATALOG, useFactory: () => new InMemoryTakeShareCatalog() },
      { provide: TAKE_JOB_CATALOG, useExisting: TAKE_SHARE_CATALOG },
      { provide: SHARE_REPOSITORY, useFactory: () => new InMemoryShareRepository() },
      { provide: JOB_SUBMISSION_STORE, useFactory: () => new InMemoryJobSubmissionStore() },
      {
        provide: JOB_OUTPUT_URL_RESOLVER,
        useFactory: () =>
          new LocalJobOutputUrlResolver(
            process.env.PUBLIC_MEDIA_BASE_URL ?? 'http://localhost:3000/public-media/',
          ),
      },
      {
        provide: PUBLIC_SHARE_MEDIA_STORE,
        useFactory: () =>
          new LocalPublicShareMediaStore(
            process.env.PUBLIC_MEDIA_BASE_URL ?? 'http://localhost:3000/public-media/',
          ),
      },
    ];
  }
  if (mode !== 'cloud') throw new Error(`Unsupported SUR_ADAPTER_MODE: ${mode}`);

  const mongoClient = new MongoClient(required('MONGODB_URI'));
  const database = mongoClient.db(required('MONGODB_DATABASE'));
  const region = required('AWS_REGION');
  const s3Client = new S3Client({ region });
  const sqsClient = new SQSClient({ region });
  required('PUBLIC_WEB_BASE_URL');
  const outboxCollection = database.collection<JobOutboxDocument>('job_outbox');
  const dispatcher = new OutboxDispatcher(
    new MongoOutboxStore(outboxCollection),
    new SqsJobQueuePublisher(sqsClient, required('SQS_JOBS_URL')),
    () => new Date(),
  );
  let dispatchTimer: NodeJS.Timeout | undefined;
  let dispatching = false;
  const drainOutbox = async () => {
    if (dispatching) return;
    dispatching = true;
    try {
      for (let count = 0; count < 10; count += 1) {
        const result = await dispatcher.dispatchNext();
        if (result !== 'published') break;
      }
    } finally {
      dispatching = false;
    }
  };
  const takeCatalog = new MongoTakePublicationCatalog(
    database.collection('take_publication_views'),
  );
  return [
    {
      provide: CLOUD_RESOURCES,
      useValue: {
        async onApplicationBootstrap() {
          await mongoClient.connect();
          await Promise.all([
            database.collection('shares').createIndex({ ownerId: 1, createdAt: -1 }),
            database.collection('shares').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
            database.collection('jobs').createIndex({ ownerId: 1, createdAt: -1 }),
            database.collection('jobs').createIndex({ status: 1, type: 1 }),
            outboxCollection.createIndex({ publishedAt: 1, lockedUntil: 1, createdAt: 1 }),
            database.collection('take_publication_views').createIndex({ ownerId: 1 }),
          ]);
          dispatchTimer = setInterval(() => {
            void drainOutbox().catch((reason: unknown) => {
              logger.error(reason instanceof Error ? reason.message : 'Outbox dispatch failed');
            });
          }, 1_000);
          dispatchTimer.unref();
          await drainOutbox();
        },
        async onApplicationShutdown() {
          if (dispatchTimer) clearInterval(dispatchTimer);
          sqsClient.destroy();
          s3Client.destroy();
          await mongoClient.close();
        },
      },
    },
    { provide: TAKE_SHARE_CATALOG, useValue: takeCatalog },
    { provide: TAKE_JOB_CATALOG, useExisting: TAKE_SHARE_CATALOG },
    {
      provide: SHARE_REPOSITORY,
      useValue: new MongoShareRepository(database.collection('shares')),
    },
    {
      provide: JOB_SUBMISSION_STORE,
      useValue: new MongoJobSubmissionStore(
        mongoClient,
        database.collection('jobs'),
        outboxCollection,
      ),
    },
    {
      provide: PUBLIC_SHARE_MEDIA_STORE,
      useValue: new S3PublicShareMediaStore(
        s3Client,
        required('S3_BUCKET_MEDIA'),
        required('PUBLIC_MEDIA_BASE_URL'),
      ),
    },
    {
      provide: JOB_OUTPUT_URL_RESOLVER,
      useValue: new S3JobOutputUrlResolver(s3Client, required('S3_BUCKET_MEDIA')),
    },
  ];
}
