import type { PitchFrame } from '@sur/shared-types';
import { describe, expect, it } from 'vitest';
import { RangeFinder } from './range-finder.js';

function frame(timeMs: number, midi: number | null, confidence = 0.95): PitchFrame {
  return { timeMs, midi, confidence, f0Hz: midi === null ? null : 220, cents: 0, rms: 0.2 };
}

describe('RangeFinder', () => {
  it('registers only after 300 ms of stable pitch', () => {
    const finder = new RangeFinder();
    expect(finder.push(frame(0, 48))).toBeNull();
    expect(finder.push(frame(100, 48.1))).toBeNull();
    expect(finder.push(frame(200, 48))).toBeNull();
    expect(finder.push(frame(300, 48.05))).toBe(48);
  });

  it('rejects a pitch crack and restarts the stability window', () => {
    const finder = new RangeFinder();
    finder.push(frame(0, 48));
    finder.push(frame(100, 48));
    finder.push(frame(180, 49));
    finder.push(frame(280, 49));
    expect(finder.push(frame(380, 49))).toBeNull();
    expect(finder.push(frame(480, 49))).toBe(49);
  });

  it('produces a normalized range and suggested Sa', () => {
    const finder = new RangeFinder();
    for (const timeMs of [0, 100, 200, 300]) finder.push(frame(timeMs, 50));
    finder.setPhase('highest');
    for (const timeMs of [400, 500, 600, 700]) finder.push(frame(timeMs, 67));
    expect(finder.result()).toEqual({
      lowestMidi: 50,
      highestMidi: 67,
      rangeSemitones: 17,
      suggestedSaMidi: 55,
      voiceTypeHint: 'middle',
    });
  });

  it('does not register low-confidence input', () => {
    const finder = new RangeFinder();
    finder.push(frame(0, 48, 0.4));
    expect(finder.push(frame(400, 48, 0.4))).toBeNull();
  });
});
