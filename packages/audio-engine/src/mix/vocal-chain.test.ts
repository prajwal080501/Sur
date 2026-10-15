import { describe, expect, it } from 'vitest';
import { applyVocalPreset, mixVoiceAndBacking } from './vocal-chain.js';

describe('vocal chain', () => {
  it('reduces DC while preserving the requested duration', () => {
    const input = new Float32Array(48_000).fill(0.4);
    const output = applyVocalPreset(input, 48_000, 'natural');
    expect(output).toHaveLength(input.length);
    expect(Math.abs(output.at(-1) ?? 1)).toBeLessThan(0.01);
    expect(output.every(Number.isFinite)).toBe(true);
  });

  it('is deterministic for every preset', () => {
    const input = Float32Array.from({ length: 2000 }, (_, index) => Math.sin(index / 10) * 0.5);
    for (const preset of ['natural', 'bollywood-shine', 'warm', 'classical-hall'] as const) {
      expect(applyVocalPreset(input, 48_000, preset)).toEqual(
        applyVocalPreset(input, 48_000, preset),
      );
    }
  });
});

describe('mixVoiceAndBacking', () => {
  it('returns equal stereo lengths and limits the peak to minus one dBFS', () => {
    const voice = new Float32Array([1, 1, 1]);
    const backing = [new Float32Array([1, 1, 1]), new Float32Array([1, 1, 1])] as const;
    const mixed = mixVoiceAndBacking(voice, backing, 0.5);
    const peak = Math.max(...mixed[0].map(Math.abs), ...mixed[1].map(Math.abs));
    expect(mixed[0]).toHaveLength(3);
    expect(mixed[1]).toHaveLength(3);
    expect(peak).toBeLessThanOrEqual(10 ** (-1 / 20) + 1e-6);
  });
});
