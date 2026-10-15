import { describe, expect, it } from 'vitest';
import {
  millisecondsPerBeat,
  nextDecisionTarget,
  quarterIndexToPosition,
} from './transport-math.js';

describe('transport math', () => {
  it('maps quarter notes to one-indexed bars and beats', () => {
    expect(quarterIndexToPosition(0)).toEqual({ bar: 1, beat: 1 });
    expect(quarterIndexToPosition(3)).toEqual({ bar: 1, beat: 4 });
    expect(quarterIndexToPosition(4)).toEqual({ bar: 2, beat: 1 });
  });

  it('requests decisions one beat before beats one and three', () => {
    expect(nextDecisionTarget({ bar: 3, beat: 2 })).toEqual({ bar: 3, beat: 3 });
    expect(nextDecisionTarget({ bar: 3, beat: 4 })).toEqual({ bar: 4, beat: 1 });
    expect(nextDecisionTarget({ bar: 3, beat: 1 })).toBeNull();
  });

  it('converts tempo to beat duration', () => {
    expect(millisecondsPerBeat(120)).toBe(500);
    expect(() => millisecondsPerBeat(0)).toThrow(RangeError);
  });
});
