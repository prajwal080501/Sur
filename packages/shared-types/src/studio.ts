import { z } from 'zod';

export const studioStateSchema = z.enum([
  'idle',
  'listening',
  'keyConfirm',
  'ready',
  'countIn',
  'accompanying',
  'recording',
  'review',
  'mix',
  'exporting',
  'shared',
]);
export type StudioState = z.infer<typeof studioStateSchema>;

export const studioEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('START_LISTEN') }),
  z.object({ type: z.literal('KEY_DETECTED') }),
  z.object({ type: z.literal('CONFIRM_KEY') }),
  z.object({ type: z.literal('RELISTEN') }),
  z.object({ type: z.literal('PLAY') }),
  z.object({ type: z.literal('RECORD') }),
  z.object({ type: z.literal('COUNT_IN_COMPLETE') }),
  z.object({ type: z.literal('STOP') }),
  z.object({ type: z.literal('KEEP') }),
  z.object({ type: z.literal('RETAKE') }),
  z.object({ type: z.literal('EXPORT') }),
  z.object({ type: z.literal('EXPORT_COMPLETE'), shared: z.boolean() }),
  z.object({ type: z.literal('BACK') }),
  z.object({ type: z.literal('CANCEL') }),
]);
export type StudioEvent = z.infer<typeof studioEventSchema>;
