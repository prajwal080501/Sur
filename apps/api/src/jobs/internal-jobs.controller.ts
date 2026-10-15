import { Body, Controller, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import type { JobService } from '@sur/job-domain';
import { jobIdSchema, workerJobUpdateSchema } from '@sur/shared-types';
import { WorkerCallbackGuard } from '../auth/worker-callback.guard.js';
import { parseRequest } from '../http/zod.js';
import { JOB_SERVICE } from './job.tokens.js';

@Controller('internal/jobs')
@UseGuards(WorkerCallbackGuard)
export class InternalJobsController {
  constructor(@Inject(JOB_SERVICE) private readonly jobs: JobService) {}

  @Post(':id/status')
  @HttpCode(204)
  async update(@Param('id') idValue: string, @Body() body: unknown): Promise<void> {
    const id = parseRequest(jobIdSchema, idValue);
    const update = parseRequest(workerJobUpdateSchema, body);
    await this.jobs.updateFromWorker(id, update);
  }
}
