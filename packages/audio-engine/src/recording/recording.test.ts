import { describe, expect, it } from 'vitest';
import { alignRecordedTracks } from './track-alignment.js';
import { renderBackingFromChords } from './backing-renderer.js';
import { encodeWav } from './wav-encoder.js';

describe('encodeWav', () => {
  it('encodes a valid 16-bit stereo RIFF header and payload', () => {
    const buffer = encodeWav({
      channels: [new Float32Array([0, 1, -1]), new Float32Array([0.5, -0.5, 0])],
      sampleRate: 48_000,
      bitDepth: 16,
    });
    const view = new DataView(buffer);
    expect(new TextDecoder().decode(buffer.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(buffer.slice(8, 12))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2);
    expect(view.getUint32(24, true)).toBe(48_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(12);
    expect(buffer.byteLength).toBe(56);
  });

  it('encodes 24-bit mono samples and rejects mismatched channels', () => {
    const buffer = encodeWav({
      channels: [new Float32Array([1, -1])],
      sampleRate: 44_100,
      bitDepth: 24,
    });
    expect(buffer.byteLength).toBe(50);
    expect(() =>
      encodeWav({ channels: [new Float32Array(2), new Float32Array(3)], sampleRate: 48_000 }),
    ).toThrow(RangeError);
  });
});

describe('alignRecordedTracks', () => {
  it('moves a late voice earlier and preserves equal track lengths', () => {
    const result = alignRecordedTracks(
      new Float32Array([0, 0, 1, 2]),
      [new Float32Array([5, 6, 7, 8]), new Float32Array([9, 10, 11, 12])],
      2,
    );
    expect([...result.voice]).toEqual([1, 2, 0, 0]);
    expect(result.voice.length).toBe(result.backing[0].length);
    expect(result.backing[0].length).toBe(result.backing[1].length);
  });

  it('pads the voice when the offset is negative', () => {
    const result = alignRecordedTracks(
      new Float32Array([1, 2, 3]),
      [new Float32Array(4), new Float32Array(4)],
      -1,
    );
    expect([...result.voice]).toEqual([0, 1, 2, 3]);
  });
});

describe('renderBackingFromChords', () => {
  it('renders a deterministic stereo track with the requested duration', () => {
    const chords = [
      {
        tMs: 0,
        bar: 1,
        beat: 1 as const,
        symbol: 'C',
        roman: 'I',
        pitches: [48, 52, 55],
        confidence: 1,
        source: 'rules' as const,
      },
    ];
    const first = renderBackingFromChords(chords, 1000, 1000);
    const second = renderBackingFromChords(chords, 1000, 1000);
    expect(first[0]).toHaveLength(1000);
    expect(first[1]).toHaveLength(1000);
    expect(first[0]).toEqual(second[0]);
    expect(first[0].some((sample) => sample !== 0)).toBe(true);
  });

  it('renders distinct piano, strum, tabla, and drum arrangements', () => {
    const chords = [
      {
        tMs: 0,
        bar: 1,
        beat: 1 as const,
        symbol: 'Am',
        roman: 'i',
        pitches: [57, 60, 64],
        confidence: 1,
        source: 'rules' as const,
      },
    ];
    const piano = renderBackingFromChords(chords, 2000, 2000, { style: 'piano' });
    const strum = renderBackingFromChords(chords, 2000, 2000, { style: 'strum' });
    const tabla = renderBackingFromChords([], 2000, 2000, { rhythm: 'keherwa' });
    const drums = renderBackingFromChords([], 2000, 2000, { rhythm: 'pop' });

    expect(piano[0]).not.toEqual(strum[0]);
    expect(tabla[0].some((sample) => sample !== 0)).toBe(true);
    expect(drums[0]).not.toEqual(tabla[0]);
  });

  it('rejects invalid render tempo', () => {
    expect(() => renderBackingFromChords([], 1000, 1000, { bpm: 20 })).toThrow(RangeError);
  });
});
