import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { JobService } from '@sur/job-domain';
import {
  createJobRequestSchema,
  createJobResponseSchema,
  jobIdSchema,
  jobResponseSchema,
} from '@sur/shared-types';
import type { AuthenticatedRequest } from '../auth/identity.js';
import { IdentityGuard } from '../auth/identity.guard.js';
import { parseRequest } from '../http/zod.js';
import { JOB_SERVICE } from './job.tokens.js';

@Controller('jobs')
@UseGuards(IdentityGuard)
export class JobsController {
  constructor(@Inject(JOB_SERVICE) private readonly jobs: JobService) {}

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: unknown) {
    const input = parseRequest(createJobRequestSchema, body);
    return createJobResponseSchema.parse(await this.jobs.create(request.identity.userId, input));
  }

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') idValue: string) {
    const id = parseRequest(jobIdSchema, idValue);
    return jobResponseSchema.parse(await this.jobs.get(request.identity.userId, id));
  }
}
