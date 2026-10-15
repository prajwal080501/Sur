import type { PitchFrame } from '@sur/shared-types';

export type RangePhase = 'lowest' | 'highest';

export interface VocalRangeResult {
  readonly lowestMidi: number;
  readonly highestMidi: number;
  readonly rangeSemitones: number;
  readonly suggestedSaMidi: number;
  readonly voiceTypeHint: 'lower' | 'middle' | 'higher';
}

export interface RangeFinderOptions {
  readonly stableDurationMs?: number;
  readonly toleranceCents?: number;
  readonly minimumConfidence?: number;
}

export class RangeFinder {
  readonly #stableDurationMs: number;
  readonly #toleranceSemitones: number;
  readonly #minimumConfidence: number;
  #phase: RangePhase = 'lowest';
  #candidateMidi: number | null = null;
  #candidateStartMs = 0;
  #lastFrameMs = 0;
  #lowestMidi: number | null = null;
  #highestMidi: number | null = null;

  constructor(options: RangeFinderOptions = {}) {
    this.#stableDurationMs = options.stableDurationMs ?? 300;
    this.#toleranceSemitones = (options.toleranceCents ?? 50) / 100;
    this.#minimumConfidence = options.minimumConfidence ?? 0.7;
  }

  setPhase(phase: RangePhase): void {
    this.#phase = phase;
    this.#clearCandidate();
  }

  push(frame: PitchFrame): number | null {
    if (frame.midi === null || frame.confidence < this.#minimumConfidence) {
      this.#clearCandidate();
      return null;
    }
    const interrupted = this.#candidateMidi !== null && frame.timeMs - this.#lastFrameMs > 100;
    const outsideTolerance =
      this.#candidateMidi !== null &&
      Math.abs(frame.midi - this.#candidateMidi) > this.#toleranceSemitones;
    if (this.#candidateMidi === null || interrupted || outsideTolerance) {
      this.#candidateMidi = frame.midi;
      this.#candidateStartMs = frame.timeMs;
    } else {
      this.#candidateMidi = this.#candidateMidi * 0.8 + frame.midi * 0.2;
    }
    this.#lastFrameMs = frame.timeMs;
    if (frame.timeMs - this.#candidateStartMs < this.#stableDurationMs) return null;

    const registered = Math.round(this.#candidateMidi);
    if (this.#phase === 'lowest') this.#lowestMidi = registered;
    else this.#highestMidi = registered;
    this.#clearCandidate();
    return registered;
  }

  result(): VocalRangeResult | null {
    if (this.#lowestMidi === null || this.#highestMidi === null) return null;
    const lowestMidi = Math.min(this.#lowestMidi, this.#highestMidi);
    const highestMidi = Math.max(this.#lowestMidi, this.#highestMidi);
    const midpoint = (lowestMidi + highestMidi) / 2;
    return {
      lowestMidi,
      highestMidi,
      rangeSemitones: highestMidi - lowestMidi,
      suggestedSaMidi: Math.min(highestMidi, lowestMidi + 5),
      voiceTypeHint: midpoint < 57 ? 'lower' : midpoint < 65 ? 'middle' : 'higher',
    };
  }

  reset(): void {
    this.#lowestMidi = null;
    this.#highestMidi = null;
    this.#phase = 'lowest';
    this.#clearCandidate();
  }

  #clearCandidate(): void {
    this.#candidateMidi = null;
    this.#candidateStartMs = 0;
    this.#lastFrameMs = 0;
  }
}
