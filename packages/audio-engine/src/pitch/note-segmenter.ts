import type { NoteEvent, PitchFrame } from '@sur/shared-types';

export interface NoteSegmenterOptions {
  readonly minimumDurationMs?: number;
  readonly minimumConfidence?: number;
  readonly maximumGapMs?: number;
  readonly maximumSegmentDurationMs?: number;
}

export class NoteSegmenter {
  readonly #minimumDurationMs: number;
  readonly #minimumConfidence: number;
  readonly #maximumGapMs: number;
  readonly #maximumSegmentDurationMs: number;
  #startMs = 0;
  #lastMs = 0;
  #targetNote: number | null = null;
  #midiTotal = 0;
  #centsTotal = 0;
  #frameCount = 0;

  constructor(options: NoteSegmenterOptions = {}) {
    this.#minimumDurationMs = options.minimumDurationMs ?? 80;
    this.#minimumConfidence = options.minimumConfidence ?? 0.7;
    this.#maximumGapMs = options.maximumGapMs ?? 50;
    this.#maximumSegmentDurationMs = options.maximumSegmentDurationMs ?? 400;
  }

  push(frame: PitchFrame): NoteEvent | null {
    const voiced =
      frame.midi !== null && frame.cents !== null && frame.confidence >= this.#minimumConfidence;
    if (!voiced) return this.#finish();

    const roundedNote = Math.round(frame.midi ?? 0);
    const startsNewNote =
      this.#targetNote === null ||
      roundedNote !== this.#targetNote ||
      frame.timeMs - this.#lastMs > this.#maximumGapMs;
    if (startsNewNote) {
      const completed = this.#finish();
      this.#append(frame, roundedNote);
      return completed;
    }
    this.#append(frame, roundedNote);
    if (frame.timeMs - this.#startMs < this.#maximumSegmentDurationMs) return null;
    const completed = this.#finish();
    this.#append(frame, roundedNote);
    return completed;
  }

  #append(frame: PitchFrame, roundedNote: number): void {
    if (this.#targetNote === null) {
      this.#targetNote = roundedNote;
      this.#startMs = frame.timeMs;
    }
    this.#lastMs = frame.timeMs;
    this.#midiTotal += frame.midi ?? 0;
    this.#centsTotal += frame.cents ?? 0;
    this.#frameCount += 1;
  }

  flush(): NoteEvent | null {
    return this.#finish();
  }

  reset(): void {
    this.#clear();
  }

  #finish(): NoteEvent | null {
    if (this.#targetNote === null) return null;
    const durationMs = this.#lastMs - this.#startMs;
    const event =
      durationMs >= this.#minimumDurationMs && this.#frameCount > 0
        ? {
            startMs: this.#startMs,
            endMs: this.#lastMs,
            midi: this.#midiTotal / this.#frameCount,
            meanCents: this.#centsTotal / this.#frameCount,
          }
        : null;
    this.#clear();
    return event;
  }

  #clear(): void {
    this.#startMs = 0;
    this.#lastMs = 0;
    this.#targetNote = null;
    this.#midiTotal = 0;
    this.#centsTotal = 0;
    this.#frameCount = 0;
  }
}
