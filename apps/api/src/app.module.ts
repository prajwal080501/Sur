import { Module } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  JobService,
  type JobOutputUrlResolver,
  type JobSubmissionStore,
  type TakeJobCatalog,
} from '@sur/job-domain';
import { ShareService } from '@sur/share-domain';
import { createIdentityVerifier } from './auth/create-identity-verifier.js';
import { IDENTITY_VERIFIER } from './auth/identity.js';
import { IdentityGuard } from './auth/identity.guard.js';
import {
  WORKER_CALLBACK_SECRET,
  WorkerCallbackGuard,
  workerCallbackSecret,
} from './auth/worker-callback.guard.js';
import { createInfrastructureProviders } from './infrastructure/providers.js';
import { JobsController } from './jobs/jobs.controller.js';
import { InternalJobsController } from './jobs/internal-jobs.controller.js';
import {
  JOB_OUTPUT_URL_RESOLVER,
  JOB_SERVICE,
  JOB_SUBMISSION_STORE,
  TAKE_JOB_CATALOG,
} from './jobs/job.tokens.js';
import { SharesController } from './shares/shares.controller.js';
import {
  PUBLIC_SHARE_MEDIA_STORE,
  SHARE_REPOSITORY,
  SHARE_SERVICE,
  TAKE_SHARE_CATALOG,
} from './shares/share.tokens.js';
import type { PublicShareMediaStore, ShareRepository, TakeShareCatalog } from '@sur/share-domain';

@Module({
  controllers: [InternalJobsController, JobsController, SharesController],
  providers: [
    IdentityGuard,
    WorkerCallbackGuard,
    {
      provide: WORKER_CALLBACK_SECRET,
      useFactory: () => workerCallbackSecret(process.env),
    },
    {
      provide: IDENTITY_VERIFIER,
      useFactory: () => createIdentityVerifier(process.env),
    },
    ...createInfrastructureProviders(),
    {
      provide: JOB_SERVICE,
      useFactory: (
        takes: TakeJobCatalog,
        submissions: JobSubmissionStore,
        outputUrls: JobOutputUrlResolver,
      ) =>
        new JobService({
          takes,
          submissions,
          outputUrls,
          nextId: () => randomBytes(12).toString('base64url'),
          now: () => new Date(),
        }),
      inject: [TAKE_JOB_CATALOG, JOB_SUBMISSION_STORE, JOB_OUTPUT_URL_RESOLVER],
    },
    {
      provide: SHARE_SERVICE,
      useFactory: (
        takes: TakeShareCatalog,
        shares: ShareRepository,
        media: PublicShareMediaStore,
      ) =>
        new ShareService({
          takes,
          shares,
          media,
          nextSlug: () => randomBytes(9).toString('base64url'),
          now: () => new Date(),
          publicBaseUrl: process.env.PUBLIC_WEB_BASE_URL ?? 'http://localhost:5173',
        }),
      inject: [TAKE_SHARE_CATALOG, SHARE_REPOSITORY, PUBLIC_SHARE_MEDIA_STORE],
    },
  ],
})
export class AppModule {}
