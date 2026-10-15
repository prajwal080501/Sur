import { describe, expect, it } from 'vitest';
import { WorkletPitchDetector } from '../browser/worklet-pitch-detector.js';
import { centsFromNearestNote, frequencyToMidi } from './music-math.js';
import { MpmDetector } from './mpm.js';

const sampleRate = 48_000;
const frameSize = 4096;

function sine(frequencyHz: number, amplitude = 0.8): Float32Array {
  const frame = new Float32Array(frameSize);
  for (let index = 0; index < frame.length; index += 1) {
    frame[index] = amplitude * Math.sin((2 * Math.PI * frequencyHz * index) / sampleRate);
  }
  return frame;
}

function sineWithVibrato(
  frequencyHz: number,
  vibratoHz: number,
  vibratoDepthCents: number,
): Float32Array {
  const frame = new Float32Array(frameSize);
  let phase = 0;
  for (let index = 0; index < frame.length; index += 1) {
    const cents = vibratoDepthCents * Math.sin((2 * Math.PI * vibratoHz * index) / sampleRate);
    const instantaneousHz = frequencyHz * 2 ** (cents / 1200);
    phase += (2 * Math.PI * instantaneousHz) / sampleRate;
    frame[index] = 0.8 * Math.sin(phase);
  }
  return frame;
}

function deterministicNoise(length: number, amplitude: number): Float32Array {
  const noise = new Float32Array(length);
  let state = 0x12345678;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) | 0;
    noise[index] = (((state >>> 0) / 0xffffffff) * 2 - 1) * amplitude;
  }
  return noise;
}

describe('MpmDetector', () => {
  it('detects synthetic tones within 10 cents', () => {
    const detector = new MpmDetector(sampleRate, frameSize);
    for (const expectedHz of [80, 110, 220, 440, 659.255, 880, 1000]) {
      const result = detector.analyze(sine(expectedHz));
      expect(result.frequencyHz).not.toBeNull();
      const errorCents =
        1200 * Math.log2((result.frequencyHz ?? Number.POSITIVE_INFINITY) / expectedHz);
      expect(Math.abs(errorCents)).toBeLessThan(10);
    }
  });

  it('gates silence', () => {
    const detector = new MpmDetector(sampleRate, frameSize);
    expect(detector.analyze(new Float32Array(frameSize)).frequencyHz).toBeNull();
  });

  it('reports a musically meaningful note', () => {
    const detector = new MpmDetector(sampleRate, frameSize);
    const frequencyHz = detector.analyze(sine(440)).frequencyHz ?? 0;
    expect(frequencyToMidi(frequencyHz)).toBeCloseTo(69, 1);
    expect(Math.abs(centsFromNearestNote(frequencyToMidi(frequencyHz)))).toBeLessThan(10);
  });

  it('tracks a tone with five-hertz vibrato without a gross pitch error', () => {
    const detector = new MpmDetector(sampleRate, frameSize, { clarityThreshold: 0.75 });
    const frequencyHz = detector.analyze(sineWithVibrato(220, 5, 30)).frequencyHz;
    expect(frequencyHz).not.toBeNull();
    const errorCents = 1200 * Math.log2((frequencyHz ?? 0) / 220);
    expect(Math.abs(errorCents)).toBeLessThan(50);
  });

  it('detects a tone with deterministic broadband noise', () => {
    const detector = new MpmDetector(sampleRate, frameSize, { clarityThreshold: 0.7 });
    const frame = sine(220, 0.7);
    const noise = deterministicNoise(frame.length, 0.07);
    for (let index = 0; index < frame.length; index += 1) {
      frame[index] = (frame[index] ?? 0) + (noise[index] ?? 0);
    }
    const frequencyHz = detector.analyze(frame).frequencyHz;
    expect(frequencyHz).not.toBeNull();
    const errorCents = 1200 * Math.log2((frequencyHz ?? 0) / 220);
    expect(Math.abs(errorCents)).toBeLessThan(10);
  });
});

describe('WorkletPitchDetector offline analysis', () => {
  it('emits contract-compatible frames without browser audio globals', async () => {
    const detector = new WorkletPitchDetector('/worklets/pitch-processor.js');
    const frames = await detector.analyzeOffline(sine(220), sampleRate);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.f0Hz).toBeCloseTo(220, 1);
    expect(frames[0]?.confidence).toBeGreaterThan(0.9);
  });
});
