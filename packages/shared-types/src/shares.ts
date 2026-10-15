import { z } from 'zod';
import { chordEventSchema } from './audio.js';

export const shareVisibilitySchema = z.enum(['unlisted', 'public']);
export type ShareVisibility = z.infer<typeof shareVisibilitySchema>;

export const shareSlugSchema = z.string().regex(/^[A-Za-z0-9_-]{8,32}$/);

export const createShareRequestSchema = z.object({
  takeId: z.string().min(1).max(128),
  visibility: shareVisibilitySchema,
  includeVideo: z.boolean(),
  expiresAt: z.string().datetime().nullable(),
});
export type CreateShareRequest = z.infer<typeof createShareRequestSchema>;

export const createShareResponseSchema = z.object({
  slug: shareSlugSchema,
  url: z.string().url(),
});
export type CreateShareResponse = z.infer<typeof createShareResponseSchema>;

export const publicShareSchema = z.object({
  title: z.string().min(1).max(120),
  singer: z.string().min(1).max(120),
  key: z.string().min(1).max(32),
  tempoBpm: z.number().int().min(50).max(180),
  audioUrl: z.string().url(),
  videoUrl: z.string().url().nullable(),
  chords: z.array(chordEventSchema),
});
export type PublicShare = z.infer<typeof publicShareSchema>;
