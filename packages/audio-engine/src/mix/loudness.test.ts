import { describe, expect, it } from 'vitest';
import { measureLoudness, normalizeLoudness } from './loudness.js';

function sine(durationSeconds: number, sampleRate: number, amplitude: number): Float32Array {
  return Float32Array.from(
    { length: durationSeconds * sampleRate },
    (_, index) => amplitude * Math.sin((2 * Math.PI * 997 * index) / sampleRate),
  );
}

describe('BS.1770 loudness', () => {
  it('measures silence without producing NaN', () => {
    const measurement = measureLoudness([new Float32Array(48_000)], 48_000);
    expect(measurement.integratedLufs).toBe(Number.NEGATIVE_INFINITY);
    expect(measurement.truePeakDbtp).toBe(Number.NEGATIVE_INFINITY);
  });

  it('normalizes program loudness to the requested target', () => {
    const source = sine(2, 48_000, 0.05);
    const normalized = normalizeLoudness([source, source], 48_000, -14, -1);
    expect(normalized.integratedLufs).toBeCloseTo(-14, 1);
    expect(normalized.truePeakDbtp).toBeLessThanOrEqual(-1 + 1e-6);
    expect(normalized.channels[0]).toHaveLength(source.length);
  });

  it('prioritizes the peak ceiling when loudness gain would clip', () => {
    const pulse = new Float32Array(48_000);
    pulse[24_000] = 1;
    const normalized = normalizeLoudness([pulse], 48_000, -14, -1);
    expect(normalized.appliedGainDb).toBeCloseTo(-1, 5);
    expect(normalized.truePeakDbtp).toBeLessThanOrEqual(-1 + 1e-6);
  });

  it('rejects unsupported sample rates explicitly', () => {
    expect(() => measureLoudness([new Float32Array(1)], 32_000)).toThrow(/44.1 kHz/);
  });
});
