import type { NoteEvent } from '@sur/shared-types';
import { describe, expect, it } from 'vitest';
import { KeyDetectorEngine } from './key-detector.js';

function phrase(notes: readonly number[], durationMs = 400): NoteEvent[] {
  return notes.map((midi, index) => ({
    startMs: index * durationMs,
    endMs: (index + 1) * durationMs,
    midi,
    meanCents: 0,
  }));
}

describe('KeyDetectorEngine', () => {
  it('detects an unambiguous C major phrase deterministically', () => {
    const detector = new KeyDetectorEngine();
    for (const note of phrase([60, 64, 67, 65, 67, 64, 62, 60])) detector.push(note);
    const first = detector.estimate();
    const second = detector.estimate();
    expect(first).toEqual(second);
    expect(first.tonicPc).toBe(0);
    expect(first.mode).toBe('major');
    expect(first.alternatives).toHaveLength(2);
  });

  it('uses the final Sa and Pa evidence in Indian mode', () => {
    const detector = new KeyDetectorEngine();
    detector.setMode('indian');
    for (const note of phrase([61, 65, 68, 65, 63, 61])) detector.push(note);
    const estimate = detector.estimate();
    expect(estimate.tonicPc).toBe(1);
    expect(estimate.saHz).toBeGreaterThan(0);
  });

  it('holds a locked key until unlocked', () => {
    const detector = new KeyDetectorEngine();
    detector.lock({ tonicPc: 7, mode: 'major', confidence: 1 });
    for (const note of phrase([60, 64, 67, 60])) detector.push(note);
    expect(detector.estimate().tonicPc).toBe(7);
    detector.unlock();
    expect(detector.estimate().tonicPc).toBe(0);
  });

  it('returns zero confidence for an empty phrase', () => {
    expect(new KeyDetectorEngine().estimate()).toEqual({
      tonicPc: 0,
      mode: 'major',
      confidence: 0,
      alternatives: [],
    });
  });
});
