import { describe, expect, it } from 'vitest';
import { encodeMp3 } from './mp3Encoder.js';

function sine(sampleRate: number, durationSeconds: number): Float32Array {
  return Float32Array.from({ length: sampleRate * durationSeconds }, (_, index) =>
    Math.sin((2 * Math.PI * 440 * index) / sampleRate),
  );
}

describe('encodeMp3', () => {
  it('encodes mono PCM into MPEG audio frames', () => {
    const encoded = new Uint8Array(
      encodeMp3({ channels: [sine(48_000, 1)], sampleRate: 48_000, bitrateKbps: 128 }),
    );
    expect(encoded.length).toBeGreaterThan(10_000);
    expect(encoded[0]).toBe(0xff);
    expect((encoded[1] ?? 0) & 0xe0).toBe(0xe0);
  });

  it('supports stereo at 320 kbps', () => {
    const channel = sine(44_100, 1);
    const encoded = encodeMp3({
      channels: [channel, channel],
      sampleRate: 44_100,
      bitrateKbps: 320,
    });
    expect(encoded.byteLength).toBeGreaterThan(30_000);
  });

  it('rejects invalid channel lengths and sample rates', () => {
    expect(() =>
      encodeMp3({
        channels: [new Float32Array(2), new Float32Array(1)],
        sampleRate: 48_000,
        bitrateKbps: 192,
      }),
    ).toThrow(/same length/);
    expect(() =>
      encodeMp3({ channels: [new Float32Array(2)], sampleRate: 32_000, bitrateKbps: 192 }),
    ).toThrow(/44.1 kHz/);
  });
});
