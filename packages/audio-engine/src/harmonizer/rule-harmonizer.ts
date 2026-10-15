import type { ChordEvent, KeyEstimate, NoteEvent } from '@sur/shared-types';
import { pitchClass, WESTERN_NOTE_NAMES } from '../pitch/music-math.js';
import { MAJOR_TRANSITION_WEIGHTS } from './transitions.js';

interface HarmonizerOptions {
  readonly key: KeyEstimate;
  readonly allowSecondary?: boolean;
  readonly changeMargin?: number;
  readonly stayBonus?: number;
  readonly bpm?: number;
}

interface Candidate {
  readonly degree: number;
  readonly rootPc: number;
  readonly tones: readonly number[];
  readonly roman: string;
  readonly symbol: string;
}

const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9] as const;
const MAJOR_ROMANS = ['I', 'ii', 'iii', 'IV', 'V', 'vi'] as const;
const MAJOR_QUALITIES = ['', 'm', 'm', '', '', 'm'] as const;
const TRIAD_INTERVALS = [
  [0, 4, 7],
  [0, 3, 7],
  [0, 3, 7],
  [0, 4, 7],
  [0, 4, 7],
  [0, 3, 7],
] as const;

export class RuleHarmonizer {
  readonly engine = 'rules' as const;
  #options: (Required<Omit<HarmonizerOptions, 'key'>> & { key: KeyEstimate }) | null = null;
  #notes: NoteEvent[] = [];
  #currentDegree = 0;
  #current: ChordEvent | null = null;
  #held = false;

  configure(options: HarmonizerOptions): void {
    this.#options = {
      key: options.key,
      allowSecondary: options.allowSecondary ?? false,
      changeMargin: options.changeMargin ?? 0.25,
      stayBonus: options.stayBonus ?? 0.3,
      bpm: options.bpm ?? 90,
    };
  }

  pushNote(note: NoteEvent): void {
    if (note.endMs > note.startMs) this.#notes.push(note);
  }

  decide(target: { bar: number; beat: 1 | 3; tMs: number }): ChordEvent {
    const options = this.#options;
    if (!options) throw new Error('Harmonizer must be configured before decide()');
    const candidates = this.#candidates(options.key);
    if (this.#held && this.#current) return { ...this.#current, ...target, source: 'hold' };

    const beatMs = 60_000 / options.bpm;
    const recentStart = target.tMs - beatMs * 2;
    const decayStart = target.tMs - beatMs * 4;
    this.#notes = this.#notes.filter((note) => note.endMs >= decayStart);
    const hasVoicedNotes = this.#notes.some(
      (note) => note.endMs > recentStart && note.startMs < target.tMs,
    );
    if (!hasVoicedNotes && this.#current) return { ...this.#current, ...target };

    const scores = candidates.map((candidate) => {
      let score = 0;
      for (const note of this.#notes) {
        const recentOverlap = Math.max(
          0,
          Math.min(note.endMs, target.tMs) - Math.max(note.startMs, recentStart),
        );
        const decayOverlap = Math.max(
          0,
          Math.min(note.endMs, recentStart) - Math.max(note.startMs, decayStart),
        );
        const duration = recentOverlap + decayOverlap * 0.5;
        if (duration <= 0) continue;
        const notePc = pitchClass(note.midi);
        const inChord = candidate.tones.includes(notePc);
        const relativePc = (notePc - options.key.tonicPc + 12) % 12;
        const inScale = [0, 2, 4, 5, 7, 9, 11].includes(relativePc);
        score += duration * (inChord ? 1 : inScale ? 0.2 : -0.5);
      }
      const transition = MAJOR_TRANSITION_WEIGHTS[this.#currentDegree]?.[candidate.degree] ?? 0;
      const stay = candidate.degree === this.#currentDegree ? options.stayBonus : 0;
      return score / beatMs + transition + stay;
    });

    let bestDegree = 0;
    for (let degree = 1; degree < scores.length; degree += 1) {
      if ((scores[degree] ?? Number.NEGATIVE_INFINITY) > (scores[bestDegree] ?? 0))
        bestDegree = degree;
    }
    const currentScore = scores[this.#currentDegree] ?? Number.NEGATIVE_INFINITY;
    const bestScore = scores[bestDegree] ?? 0;
    if (this.#current && bestScore - currentScore < options.changeMargin)
      bestDegree = this.#currentDegree;

    const chosen = candidates[bestDegree] ?? candidates[0];
    if (!chosen) throw new Error('No chord candidates available');
    this.#currentDegree = bestDegree;
    const secondBest = [...scores].sort((left, right) => right - left)[1] ?? bestScore;
    this.#current = {
      ...target,
      symbol: chosen.symbol,
      roman: chosen.roman,
      pitches: this.#voicing(chosen),
      confidence: Math.max(0, Math.min(1, 0.5 + (bestScore - secondBest) / 2)),
      source: 'rules',
    };
    return this.#current;
  }

  peekNext(): ChordEvent | null {
    return null;
  }

  hold(on: boolean): void {
    this.#held = on;
  }

  reset(): void {
    this.#notes = [];
    this.#currentDegree = 0;
    this.#current = null;
    this.#held = false;
  }

  #candidates(key: KeyEstimate): Candidate[] {
    return MAJOR_DEGREES.map((interval, degree) => {
      const rootPc = (key.tonicPc + interval) % 12;
      const intervals = TRIAD_INTERVALS[degree] ?? TRIAD_INTERVALS[0];
      return {
        degree,
        rootPc,
        tones: intervals.map((tone) => (rootPc + tone) % 12),
        roman: MAJOR_ROMANS[degree] ?? 'I',
        symbol: `${WESTERN_NOTE_NAMES[rootPc] ?? 'C'}${MAJOR_QUALITIES[degree] ?? ''}`,
      };
    });
  }

  #voicing(candidate: Candidate): number[] {
    const root = 48 + candidate.rootPc;
    const intervals = TRIAD_INTERVALS[candidate.degree] ?? TRIAD_INTERVALS[0];
    return intervals.map((interval) => root + interval);
  }
}
