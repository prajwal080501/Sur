import type { KeyEstimate, PitchFrame, TakeReport } from '@sur/shared-types';

const SCALE_INTERVALS = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
} as const;

interface ScoredFrame {
  readonly sungNote: number;
  readonly errorCents: number;
  readonly cents: number;
  readonly timeMs: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function nearestInKeyMidi(midi: number, key: KeyEstimate): number {
  const pitchClasses = new Set(
    SCALE_INTERVALS[key.mode].map((interval) => (key.tonicPc + interval) % 12),
  );
  const center = Math.round(midi);
  let best = center;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let candidate = center - 2; candidate <= center + 2; candidate += 1) {
    if (!pitchClasses.has(((candidate % 12) + 12) % 12)) continue;
    const distance = Math.abs(midi - candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function stabilityFromHeldNotes(frames: readonly ScoredFrame[]): number {
  const deviations: number[] = [];
  let group: ScoredFrame[] = [];
  const finishGroup = () => {
    if (group.length < 2 || (group.at(-1)?.timeMs ?? 0) - (group[0]?.timeMs ?? 0) < 300) {
      group = [];
      return;
    }
    const center = median(group.map((frame) => frame.cents));
    deviations.push(...group.map((frame) => Math.abs(frame.cents - center)));
    group = [];
  };
  for (const frame of frames) {
    const previous = group.at(-1);
    if (previous && (previous.sungNote !== frame.sungNote || frame.timeMs - previous.timeMs > 80)) {
      finishGroup();
    }
    group.push(frame);
  }
  finishGroup();
  return median(deviations);
}

export function createTakeReport(pitchFrames: readonly PitchFrame[], key: KeyEstimate): TakeReport {
  const scored: ScoredFrame[] = pitchFrames.flatMap((frame) => {
    if (frame.midi === null || frame.cents === null || frame.confidence < 0.7) return [];
    const nearest = nearestInKeyMidi(frame.midi, key);
    return [
      {
        sungNote: Math.round(frame.midi),
        errorCents: Math.abs(frame.midi - nearest) * 100,
        cents: frame.cents,
        timeMs: frame.timeMs,
      },
    ];
  });
  if (scored.length === 0) {
    return {
      pitchAccuracyPct: 0,
      rangeLowMidi: 0,
      rangeHighMidi: 0,
      key: { tonicPc: key.tonicPc, mode: key.mode },
      stabilityCents: 0,
      weakestNotes: [],
    };
  }

  const noteErrors = new Map<number, number[]>();
  for (const frame of scored) {
    const errors = noteErrors.get(frame.sungNote) ?? [];
    errors.push(frame.errorCents);
    noteErrors.set(frame.sungNote, errors);
  }
  const weakestNotes = [...noteErrors.entries()]
    .map(([note, errors]) => ({
      note,
      error: errors.reduce((sum, error) => sum + error, 0) / errors.length,
    }))
    .sort((left, right) => right.error - left.error || left.note - right.note)
    .slice(0, 3)
    .map(({ note }) => note);
  const notes = scored.map((frame) => frame.sungNote);

  return {
    pitchAccuracyPct:
      (scored.filter((frame) => frame.errorCents <= 25).length / scored.length) * 100,
    rangeLowMidi: Math.min(...notes),
    rangeHighMidi: Math.max(...notes),
    key: { tonicPc: key.tonicPc, mode: key.mode },
    stabilityCents: stabilityFromHeldNotes(scored),
    weakestNotes,
  };
}
