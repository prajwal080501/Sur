import { z } from 'zod';

export const jobIdSchema = z.string().min(1).max(128);

export const renderVideoParamsSchema = z
  .object({
    aspect: z.literal('9:16'),
    durationMs: z.number().int().min(100).max(60_000),
    startMs: z.number().int().min(0),
    title: z.string().trim().min(1).max(120),
    background: z.enum(['gradient-1', 'midnight', 'warm']),
    showChords: z.boolean(),
  })
  .refine((value) => value.startMs + value.durationMs <= 3_600_000, {
    message: 'Render range must end within one hour',
    path: ['durationMs'],
  });
export type RenderVideoParams = z.infer<typeof renderVideoParamsSchema>;

export const createJobRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('render_video'),
    takeId: z.string().min(1).max(128),
    params: renderVideoParamsSchema,
  }),
]);
export type CreateJobRequest = z.infer<typeof createJobRequestSchema>;

export const jobStatusSchema = z.enum(['queued', 'processing', 'done', 'failed', 'cancelled']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const createJobResponseSchema = z.object({
  id: jobIdSchema,
  status: z.literal('queued'),
});
export type CreateJobResponse = z.infer<typeof createJobResponseSchema>;

export const jobResponseSchema = z.object({
  id: jobIdSchema,
  type: z.literal('render_video'),
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  outputs: z
    .object({
      videoUrl: z.string().url(),
      posterUrl: z.string().url().nullable(),
    })
    .nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});
export type JobResponse = z.infer<typeof jobResponseSchema>;

const objectKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((key) => !key.startsWith('/') && !key.split('/').includes('..'), 'Invalid object key');

export const workerJobUpdateSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('processing'),
    progress: z.number().int().min(1).max(99),
  }),
  z.object({
    status: z.literal('done'),
    progress: z.literal(100),
    output: z.object({ videoObjectKey: objectKeySchema }),
    metrics: z.object({
      elapsedMs: z.number().int().min(0).max(86_400_000),
      reused: z.boolean(),
    }),
  }),
  z.object({
    status: z.literal('failed'),
    progress: z.literal(0),
    error: z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
      message: z.string().trim().min(1).max(500),
    }),
  }),
]);
export type WorkerJobUpdate = z.infer<typeof workerJobUpdateSchema>;
