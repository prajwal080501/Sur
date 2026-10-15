import type { ChordEvent } from '@sur/shared-types';
import {
  chordPattern,
  rhythmHits,
  type AccompanimentStyle,
  type PercussionVoice,
  type RhythmStyle,
} from '../accompaniment/patterns.js';

export interface BackingRenderOptions {
  readonly style?: AccompanimentStyle;
  readonly rhythm?: RhythmStyle;
  readonly bpm?: number;
  readonly harmonyGain?: number;
  readonly rhythmGain?: number;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function deterministicNoise(index: number, seed: number): number {
  const value = Math.sin((index + 1) * (12.9898 + seed * 0.371)) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function addSample(
  channels: readonly [Float32Array, Float32Array],
  startSeconds: number,
  durationSeconds: number,
  sampleRate: number,
  gain: number,
  pan: number,
  render: (time: number, index: number) => number,
): void {
  const start = Math.max(0, Math.floor(startSeconds * sampleRate));
  const end = Math.min(
    channels[0].length,
    Math.ceil((startSeconds + durationSeconds) * sampleRate),
  );
  const leftGain = Math.sqrt((1 - pan) / 2);
  const rightGain = Math.sqrt((1 + pan) / 2);
  for (let outputIndex = start; outputIndex < end; outputIndex += 1) {
    const localIndex = outputIndex - start;
    const value = render(localIndex / sampleRate, localIndex) * gain;
    channels[0][outputIndex] = (channels[0][outputIndex] ?? 0) + value * leftGain;
    channels[1][outputIndex] = (channels[1][outputIndex] ?? 0) + value * rightGain;
  }
}

function addHarmonicStrike(
  channels: readonly [Float32Array, Float32Array],
  pitches: readonly number[],
  startSeconds: number,
  durationSeconds: number,
  sampleRate: number,
  style: AccompanimentStyle,
  velocity: number,
  gain: number,
): void {
  pitches.forEach((midi, pitchIndex) => {
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    const pan = pitches.length <= 1 ? 0 : (pitchIndex / (pitches.length - 1)) * 0.7 - 0.35;
    addSample(
      channels,
      startSeconds,
      durationSeconds,
      sampleRate,
      (gain * velocity) / Math.sqrt(Math.max(1, pitches.length)),
      pan,
      (time, index) => {
        const attack = Math.min(1, time / (style === 'pad' ? 0.18 : 0.008));
        const release = Math.min(1, (durationSeconds - time) / (style === 'pad' ? 0.35 : 0.09));
        const decay = style === 'pad' ? 0.82 : Math.exp(-time / (style === 'piano' ? 0.72 : 0.48));
        const base = Math.sin(2 * Math.PI * frequency * time);
        const second = Math.sin(2 * Math.PI * frequency * 2 * time + 0.13);
        const third = Math.sin(2 * Math.PI * frequency * 3 * time + 0.31);
        const transient = deterministicNoise(index, frequency) * Math.exp(-time / 0.014);
        const tone =
          style === 'pad'
            ? base * 0.64 + second * 0.22 + third * 0.08
            : style === 'piano'
              ? base * 0.68 + second * 0.2 + third * 0.08 + transient * 0.07
              : base * 0.57 + second * 0.27 + third * 0.12 + transient * 0.04;
        return tone * attack * Math.max(0, release) * decay;
      },
    );
  });
}

function percussionDuration(voice: PercussionVoice): number {
  if (voice === 'hat') return 0.14;
  if (voice === 'snare') return 0.3;
  return 0.48;
}

function addPercussionHit(
  channels: readonly [Float32Array, Float32Array],
  voice: PercussionVoice,
  startSeconds: number,
  sampleRate: number,
  velocity: number,
  gain: number,
): void {
  const duration = percussionDuration(voice);
  const voiceIndex = ['tabla-bass', 'tabla-treble', 'kick', 'snare', 'hat'].indexOf(voice) + 1;
  const pan = voice === 'tabla-bass' ? -0.12 : voice === 'tabla-treble' ? 0.12 : 0;
  addSample(channels, startSeconds, duration, sampleRate, gain * velocity, pan, (time, index) => {
    const noise = deterministicNoise(index, voiceIndex);
    if (voice === 'hat') return noise * Math.exp(-time / 0.035) * 0.3;
    if (voice === 'snare') {
      return (
        (noise * 0.68 + Math.sin(2 * Math.PI * 185 * time) * 0.22) * Math.exp(-time / 0.085) * 0.42
      );
    }
    const baseFrequency = voice === 'kick' ? 78 : voice === 'tabla-bass' ? 112 : 238;
    const sweep = baseFrequency * (1 + 1.7 * Math.exp(-time / 0.045));
    const decay = voice === 'tabla-treble' ? 0.095 : 0.16;
    return (
      (Math.sin(2 * Math.PI * sweep * time) * 0.65 +
        Math.sin(2 * Math.PI * baseFrequency * 1.73 * time) * 0.16 +
        noise * Math.exp(-time / 0.014) * 0.14) *
      Math.exp(-time / decay) *
      0.55
    );
  });
}

function softLimit(channels: readonly Float32Array[]): void {
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.tanh(channel[index] ?? 0);
    }
  }
}

export function renderBackingFromChords(
  chords: readonly ChordEvent[],
  durationMs: number,
  sampleRate: number,
  options: BackingRenderOptions = {},
): readonly [Float32Array, Float32Array] {
  if (durationMs < 0 || !Number.isFinite(durationMs)) {
    throw new RangeError('durationMs must be non-negative');
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('sampleRate must be positive');
  }
  const bpm = options.bpm ?? 90;
  if (!Number.isFinite(bpm) || bpm < 50 || bpm > 180) {
    throw new RangeError('bpm must be between 50 and 180');
  }
  const style = options.style ?? 'pad';
  const rhythm = options.rhythm ?? 'none';
  const harmonyGain = clampUnit(options.harmonyGain ?? 0.62);
  const rhythmGain = clampUnit(options.rhythmGain ?? 0.7);
  const length = Math.ceil((durationMs / 1000) * sampleRate);
  const channels: [Float32Array, Float32Array] = [
    new Float32Array(length),
    new Float32Array(length),
  ];
  const beatSeconds = 60 / bpm;

  for (const chord of [...chords].sort((left, right) => left.tMs - right.tMs)) {
    for (const strike of chordPattern(style)) {
      const pitches =
        strike.noteOrder === 'descending' ? [...chord.pitches].reverse() : [...chord.pitches];
      if (strike.noteOrder === 'block') {
        addHarmonicStrike(
          channels,
          pitches,
          chord.tMs / 1000 + strike.atBeats * beatSeconds,
          strike.durationBeats * beatSeconds,
          sampleRate,
          style,
          strike.velocity,
          harmonyGain * 0.32,
        );
        continue;
      }
      pitches.forEach((pitch, pitchIndex) => {
        addHarmonicStrike(
          channels,
          [pitch],
          chord.tMs / 1000 + (strike.atBeats + pitchIndex * strike.spreadBeats) * beatSeconds,
          strike.durationBeats * beatSeconds,
          sampleRate,
          style,
          strike.velocity,
          harmonyGain * 0.32,
        );
      });
    }
  }

  const eighthSeconds = beatSeconds / 2;
  for (let eighthIndex = 0; eighthIndex * eighthSeconds < durationMs / 1000; eighthIndex += 1) {
    for (const hit of rhythmHits(rhythm, eighthIndex)) {
      addPercussionHit(
        channels,
        hit.voice,
        eighthIndex * eighthSeconds,
        sampleRate,
        hit.velocity,
        rhythmGain,
      );
    }
  }
  softLimit(channels);
  return channels;
}
