import type { KeyEstimate, NoteEvent } from '@sur/shared-types';
import { midiToFrequency, pitchClass } from '../pitch/music-math.js';

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

type KeyMode = 'western' | 'indian';
type EstimateWithAlternatives = KeyEstimate & { alternatives: KeyEstimate[] };

interface ScoredKey {
  readonly tonicPc: number;
  readonly mode: 'major' | 'minor';
  readonly score: number;
}

function pearson(left: readonly number[], right: readonly number[]): number {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = (left[index] ?? 0) - leftMean;
    const rightDelta = (right[index] ?? 0) - rightMean;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? 0 : numerator / denominator;
}

function confidenceFromScore(score: number): number {
  return Math.max(0, Math.min(1, (score + 1) / 2));
}

export class KeyDetectorEngine {
  #mode: KeyMode = 'western';
  #notes: NoteEvent[] = [];
  #locked: KeyEstimate | null = null;

  setMode(mode: KeyMode): void {
    this.#mode = mode;
  }

  push(note: NoteEvent): void {
    if (note.endMs <= note.startMs || !Number.isFinite(note.midi)) return;
    this.#notes.push(note);
  }

  estimate(): EstimateWithAlternatives {
    if (this.#locked) return { ...this.#locked, alternatives: [] };
    if (this.#notes.length === 0) {
      return { tonicPc: 0, mode: 'major', confidence: 0, alternatives: [] };
    }

    const histogram = new Array<number>(12).fill(0);
    for (const note of this.#notes) {
      const duration = note.endMs - note.startMs;
      const heldWeight = duration >= 300 ? 1.5 : 1;
      const notePc = pitchClass(note.midi);
      histogram[notePc] = (histogram[notePc] ?? 0) + duration * heldWeight;
    }
    const finalNote = this.#notes.at(-1);
    if (finalNote) {
      const finalPc = pitchClass(finalNote.midi);
      histogram[finalPc] = (histogram[finalPc] ?? 0) + (finalNote.endMs - finalNote.startMs) * 0.5;
    }

    return this.#mode === 'indian'
      ? this.#estimateIndian(histogram)
      : this.#estimateWestern(histogram);
  }

  lock(key: KeyEstimate): void {
    this.#locked = { ...key };
  }

  unlock(): void {
    this.#locked = null;
  }

  reset(): void {
    this.#notes = [];
    this.#locked = null;
  }

  #estimateWestern(histogram: readonly number[]): EstimateWithAlternatives {
    const candidates: ScoredKey[] = [];
    for (let tonicPc = 0; tonicPc < 12; tonicPc += 1) {
      for (const [mode, profile] of [
        ['major', MAJOR_PROFILE],
        ['minor', MINOR_PROFILE],
      ] as const) {
        const rotated = new Array<number>(12);
        for (let pitch = 0; pitch < 12; pitch += 1) {
          rotated[pitch] = profile[(pitch - tonicPc + 12) % 12] ?? 0;
        }
        candidates.push({ tonicPc, mode, score: pearson(histogram, rotated) });
      }
    }
    candidates.sort((left, right) => right.score - left.score || left.tonicPc - right.tonicPc);
    return this.#toEstimate(candidates);
  }

  #estimateIndian(histogram: readonly number[]): EstimateWithAlternatives {
    const finalPc = pitchClass(this.#notes.at(-1)?.midi ?? 0);
    const maximum = Math.max(...histogram, 1);
    const candidates: ScoredKey[] = [];
    for (let tonicPc = 0; tonicPc < 12; tonicPc += 1) {
      const tonicWeight = histogram[tonicPc] ?? 0;
      const paWeight = histogram[(tonicPc + 7) % 12] ?? 0;
      const finalWeight = finalPc === tonicPc ? maximum * 0.5 : 0;
      candidates.push({
        tonicPc,
        mode: 'major',
        score: (tonicWeight + paWeight * 0.6 + finalWeight) / (maximum * 2.1),
      });
    }
    candidates.sort((left, right) => right.score - left.score || left.tonicPc - right.tonicPc);
    const estimate = this.#toEstimate(candidates, true);
    return estimate;
  }

  #toEstimate(candidates: readonly ScoredKey[], includeSa = false): EstimateWithAlternatives {
    const best = candidates[0] ?? { tonicPc: 0, mode: 'major' as const, score: 0 };
    const makeEstimate = (candidate: ScoredKey): KeyEstimate => {
      const estimate: KeyEstimate = {
        tonicPc: candidate.tonicPc,
        mode: candidate.mode,
        confidence: includeSa
          ? Math.max(0, Math.min(1, candidate.score))
          : confidenceFromScore(candidate.score),
      };
      if (includeSa) {
        const meanMidi =
          this.#notes.reduce((sum, note) => sum + note.midi, 0) / Math.max(1, this.#notes.length);
        const saMidi = candidate.tonicPc + 12 * Math.round((meanMidi - candidate.tonicPc) / 12);
        estimate.saHz = midiToFrequency(saMidi);
      }
      return estimate;
    };
    return {
      ...makeEstimate(best),
      alternatives: candidates.slice(1, 3).map(makeEstimate),
    };
  }
}
