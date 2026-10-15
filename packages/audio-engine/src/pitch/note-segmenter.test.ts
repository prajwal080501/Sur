import type { PitchFrame } from '@sur/shared-types';
import { describe, expect, it } from 'vitest';
import { NoteSegmenter } from './note-segmenter.js';

function frame(timeMs: number, midi: number | null, confidence = 0.95): PitchFrame {
  return {
    timeMs,
    f0Hz: midi === null ? null : 440 * 2 ** ((midi - 69) / 12),
    midi,
    cents: midi === null ? null : (midi - Math.round(midi)) * 100,
    confidence,
    rms: midi === null ? 0 : 0.2,
  };
}

describe('NoteSegmenter', () => {
  it('emits a stable note after the minimum duration', () => {
    const segmenter = new NoteSegmenter();
    for (const timeMs of [0, 20, 40, 60, 80, 100]) {
      expect(segmenter.push(frame(timeMs, 60.08))).toBeNull();
    }
    const note = segmenter.push(frame(120, null));
    expect(note?.startMs).toBe(0);
    expect(note?.endMs).toBe(100);
    expect(note?.midi).toBeCloseTo(60.08, 5);
    expect(note?.meanCents).toBeCloseTo(8, 5);
  });

  it('emits rolling events while a stable note remains voiced', () => {
    const segmenter = new NoteSegmenter({ maximumSegmentDurationMs: 200 });
    for (const timeMs of [0, 40, 80, 120, 160]) {
      expect(segmenter.push(frame(timeMs, 69))).toBeNull();
    }
    expect(segmenter.push(frame(200, 69))).toMatchObject({
      startMs: 0,
      endMs: 200,
      midi: 69,
    });
    for (const timeMs of [240, 280, 320, 360]) {
      expect(segmenter.push(frame(timeMs, 69))).toBeNull();
    }
    expect(segmenter.push(frame(400, 69))).toMatchObject({
      startMs: 200,
      endMs: 400,
      midi: 69,
    });
  });

  it('rejects short glitches', () => {
    const segmenter = new NoteSegmenter();
    segmenter.push(frame(0, 60));
    segmenter.push(frame(40, 60));
    expect(segmenter.push(frame(60, null))).toBeNull();
  });

  it('splits notes at semitone boundaries', () => {
    const segmenter = new NoteSegmenter();
    for (const timeMs of [0, 30, 60, 90]) segmenter.push(frame(timeMs, 60));
    const first = segmenter.push(frame(120, 62));
    expect(Math.round(first?.midi ?? 0)).toBe(60);
    for (const timeMs of [150, 180, 210]) segmenter.push(frame(timeMs, 62));
    expect(Math.round(segmenter.flush()?.midi ?? 0)).toBe(62);
  });

  it('rejects low-confidence frames as unvoiced', () => {
    const segmenter = new NoteSegmenter();
    for (const timeMs of [0, 30, 60, 90]) segmenter.push(frame(timeMs, 60));
    expect(segmenter.push(frame(120, 60, 0.4))).not.toBeNull();
  });
});
