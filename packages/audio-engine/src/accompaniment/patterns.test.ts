import { describe, expect, it } from 'vitest';
import { chordPattern, rhythmCycleLength, rhythmHits } from './patterns.js';

describe('accompaniment patterns', () => {
  it('provides distinct two-beat pad, piano, and strum arrangements', () => {
    expect(chordPattern('pad')).toHaveLength(1);
    expect(chordPattern('piano')).toHaveLength(4);
    expect(chordPattern('strum')).toHaveLength(4);
    for (const style of ['pad', 'piano', 'strum'] as const) {
      expect(chordPattern(style).every((strike) => strike.atBeats >= 0 && strike.atBeats < 2)).toBe(
        true,
      );
    }
  });

  it('models complete Keherwa, Dadra, and pop cycles on eighth-note steps', () => {
    expect(rhythmCycleLength('keherwa')).toBe(16);
    expect(rhythmCycleLength('dadra')).toBe(12);
    expect(rhythmCycleLength('pop')).toBe(8);
    expect(rhythmHits('keherwa', 0)).toContainEqual({
      voice: 'tabla-bass',
      velocity: 0.95,
    });
    expect(rhythmHits('dadra', 12)).toEqual(rhythmHits('dadra', 0));
    expect(rhythmHits('pop', 2).map((hit) => hit.voice)).toContain('snare');
    expect(rhythmHits('none', 0)).toEqual([]);
  });

  it('rejects invalid rhythm positions', () => {
    expect(() => rhythmHits('pop', -1)).toThrow(RangeError);
    expect(() => rhythmHits('pop', 0.5)).toThrow(RangeError);
  });
});
