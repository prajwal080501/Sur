import type { KeyEstimate, PitchFrame } from '@sur/shared-types';
import { describe, expect, it } from 'vitest';
import { createTakeReport } from './take-report.js';

const key: KeyEstimate = { tonicPc: 0, mode: 'major', confidence: 1 };

function frame(timeMs: number, midi: number | null, confidence = 0.95): PitchFrame {
  return {
    timeMs,
    midi,
    f0Hz: midi === null ? null : 440 * 2 ** ((midi - 69) / 12),
    cents: midi === null ? null : (midi - Math.round(midi)) * 100,
    confidence,
    rms: midi === null ? 0 : 0.2,
  };
}

describe('createTakeReport', () => {
  it('measures in-key accuracy, range, and weakest notes', () => {
    const report = createTakeReport(
      [frame(0, 60.1), frame(20, 62.2), frame(40, 63), frame(60, 67.05)],
      key,
    );
    expect(report.pitchAccuracyPct).toBe(75);
    expect(report.rangeLowMidi).toBe(60);
    expect(report.rangeHighMidi).toBe(67);
    expect(report.weakestNotes[0]).toBe(63);
    expect(report.key).toEqual({ tonicPc: 0, mode: 'major' });
  });

  it('computes median deviation only from notes held for at least 300 ms', () => {
    const frames = Array.from({ length: 21 }, (_, index) =>
      frame(index * 20, 60 + ((index % 3) - 1) * 0.1),
    );
    expect(createTakeReport(frames, key).stabilityCents).toBeCloseTo(10);
  });

  it('returns a stable empty report for unvoiced input', () => {
    expect(createTakeReport([frame(0, null)], key)).toEqual({
      pitchAccuracyPct: 0,
      rangeLowMidi: 0,
      rangeHighMidi: 0,
      key: { tonicPc: 0, mode: 'major' },
      stabilityCents: 0,
      weakestNotes: [],
    });
  });
});
