export interface TransportPosition {
  readonly bar: number;
  readonly beat: 1 | 2 | 3 | 4;
}

export function quarterIndexToPosition(quarterIndex: number): TransportPosition {
  if (!Number.isInteger(quarterIndex) || quarterIndex < 0) {
    throw new RangeError('quarterIndex must be a non-negative integer');
  }
  return {
    bar: Math.floor(quarterIndex / 4) + 1,
    beat: ((quarterIndex % 4) + 1) as 1 | 2 | 3 | 4,
  };
}

export function nextDecisionTarget(
  position: TransportPosition,
): { bar: number; beat: 1 | 3 } | null {
  if (position.beat === 2) return { bar: position.bar, beat: 3 };
  if (position.beat === 4) return { bar: position.bar + 1, beat: 1 };
  return null;
}

export function millisecondsPerBeat(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) throw new RangeError('bpm must be positive');
  return 60_000 / bpm;
}
