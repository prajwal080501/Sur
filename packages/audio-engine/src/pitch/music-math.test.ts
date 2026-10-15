import { describe, expect, it } from 'vitest';
import { SARGAM_NAMES, frequencyToMidi, midiToFrequency, sargamName } from './music-math.js';

describe('music math', () => {
  it('round trips frequency and MIDI', () => {
    for (const midi of [21, 48, 60, 69, 108]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 10);
    }
  });

  it('maps all notes relative to every Sa across three octaves', () => {
    for (let sa = 0; sa < 12; sa += 1) {
      for (let midi = 36; midi < 72; midi += 1) {
        expect(sargamName(midi, sa)).toBe(SARGAM_NAMES[(midi - sa + 120) % 12]);
      }
    }
  });
});
