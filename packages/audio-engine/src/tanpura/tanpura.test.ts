import { describe, expect, it } from 'vitest';
import { frequencyToMidi } from '../pitch/music-math.js';
import { tanpuraFrequencies } from './tanpura.js';

describe('tanpuraFrequencies', () => {
  it('builds the Pa Sa Sa Sa-octave sequence', () => {
    const frequencies = tanpuraFrequencies(49, 'Pa');
    expect(frequencies.map(frequencyToMidi)).toEqual(
      expect.arrayContaining([expect.closeTo(56, 8), expect.closeTo(49, 8), expect.closeTo(61, 8)]),
    );
  });

  it('applies fine tuning equally to every string', () => {
    const frequencies = tanpuraFrequencies(49, 'Ma', 35);
    const midis = frequencies.map(frequencyToMidi);
    expect(midis[0]).toBeCloseTo(54.35, 8);
    expect(midis[1]).toBeCloseTo(49.35, 8);
    expect(midis[3]).toBeCloseTo(61.35, 8);
  });
});
