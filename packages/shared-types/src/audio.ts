import { z } from 'zod';

export const notationModeSchema = z.enum(['western', 'sargam', 'both']);
export type NotationMode = z.infer<typeof notationModeSchema>;

export const pitchFrameSchema = z.object({
  timeMs: z.number().nonnegative(),
  f0Hz: z.number().positive().nullable(),
  midi: z.number().nullable(),
  cents: z.number().min(-50).max(50).nullable(),
  confidence: z.number().min(0).max(1),
  rms: z.number().nonnegative(),
});
export type PitchFrame = z.infer<typeof pitchFrameSchema>;

export const noteEventSchema = z
  .object({
    startMs: z.number().nonnegative(),
    endMs: z.number().nonnegative(),
    midi: z.number(),
    meanCents: z.number(),
  })
  .refine(({ startMs, endMs }) => endMs >= startMs, {
    message: 'endMs must not precede startMs',
    path: ['endMs'],
  });
export type NoteEvent = z.infer<typeof noteEventSchema>;

export const keyEstimateSchema = z.object({
  tonicPc: z.number().int().min(0).max(11),
  mode: z.enum(['major', 'minor']),
  saHz: z.number().positive().optional(),
  confidence: z.number().min(0).max(1),
});
export type KeyEstimate = z.infer<typeof keyEstimateSchema>;

export const takeReportSchema = z.object({
  pitchAccuracyPct: z.number().min(0).max(100),
  rangeLowMidi: z.number(),
  rangeHighMidi: z.number(),
  key: keyEstimateSchema.pick({ tonicPc: true, mode: true }),
  stabilityCents: z.number().nonnegative(),
  weakestNotes: z.array(z.number()).max(3),
});
export type TakeReport = z.infer<typeof takeReportSchema>;

export const chordEventSchema = z.object({
  tMs: z.number().nonnegative(),
  bar: z.number().int().positive(),
  beat: z.union([z.literal(1), z.literal(3)]),
  symbol: z.string().min(1),
  roman: z.string().min(1),
  pitches: z.array(z.number().int()),
  confidence: z.number().min(0).max(1),
  source: z.enum(['rules', 'onnx', 'hold', 'user']),
});
export type ChordEvent = z.infer<typeof chordEventSchema>;
