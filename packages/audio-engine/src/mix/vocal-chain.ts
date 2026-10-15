export type VocalPreset = 'natural' | 'bollywood-shine' | 'warm' | 'classical-hall';

interface PresetDefinition {
  readonly hpfHz: number;
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly presence: number;
  readonly reverbWet: number;
  readonly reverbMs: number;
}

const PRESETS: Record<VocalPreset, PresetDefinition> = {
  natural: {
    hpfHz: 75,
    thresholdDb: -18,
    ratio: 2.5,
    presence: 0.08,
    reverbWet: 0.12,
    reverbMs: 55,
  },
  'bollywood-shine': {
    hpfHz: 95,
    thresholdDb: -20,
    ratio: 3.2,
    presence: 0.18,
    reverbWet: 0.2,
    reverbMs: 70,
  },
  warm: { hpfHz: 65, thresholdDb: -16, ratio: 2.2, presence: 0.04, reverbWet: 0.16, reverbMs: 62 },
  'classical-hall': {
    hpfHz: 70,
    thresholdDb: -17,
    ratio: 2,
    presence: 0.06,
    reverbWet: 0.3,
    reverbMs: 95,
  },
};

function highPass(input: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const output = new Float32Array(input.length);
  const alpha = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let previousInput = 0;
  let previousOutput = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    const filtered = alpha * (previousOutput + sample - previousInput);
    output[index] = filtered;
    previousInput = sample;
    previousOutput = filtered;
  }
  return output;
}

function compress(
  input: Float32Array,
  sampleRate: number,
  thresholdDb: number,
  ratio: number,
): Float32Array {
  const output = new Float32Array(input.length);
  const attack = Math.exp(-1 / (sampleRate * 0.01));
  const release = Math.exp(-1 / (sampleRate * 0.12));
  let envelope = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    const magnitude = Math.abs(sample);
    const coefficient = magnitude > envelope ? attack : release;
    envelope = coefficient * envelope + (1 - coefficient) * magnitude;
    const envelopeDb = 20 * Math.log10(Math.max(envelope, 1e-7));
    const compressedDb =
      envelopeDb > thresholdDb ? thresholdDb + (envelopeDb - thresholdDb) / ratio : envelopeDb;
    const gain = 10 ** ((compressedDb - envelopeDb) / 20);
    output[index] = sample * gain;
  }
  return output;
}

function addPresence(input: Float32Array, amount: number): Float32Array {
  const output = new Float32Array(input.length);
  let previous = 0;
  for (let index = 0; index < input.length; index += 1) {
    const sample = input[index] ?? 0;
    output[index] = sample + (sample - previous) * amount;
    previous = sample;
  }
  return output;
}

function addReverb(
  input: Float32Array,
  sampleRate: number,
  wet: number,
  delayMs: number,
): Float32Array {
  const output = new Float32Array(input.length);
  const firstDelay = Math.max(1, Math.round((delayMs / 1000) * sampleRate));
  const secondDelay = Math.max(1, Math.round(firstDelay * 1.47));
  for (let index = 0; index < input.length; index += 1) {
    const dry = input[index] ?? 0;
    const first = index >= firstDelay ? (output[index - firstDelay] ?? 0) * 0.45 : 0;
    const second = index >= secondDelay ? (output[index - secondDelay] ?? 0) * 0.28 : 0;
    output[index] = dry * (1 - wet) + (first + second) * wet;
  }
  return output;
}

export function applyVocalPreset(
  input: Float32Array,
  sampleRate: number,
  preset: VocalPreset,
): Float32Array {
  const definition = PRESETS[preset];
  const filtered = highPass(input, sampleRate, definition.hpfHz);
  const compressed = compress(filtered, sampleRate, definition.thresholdDb, definition.ratio);
  const present = addPresence(compressed, definition.presence);
  return addReverb(present, sampleRate, definition.reverbWet, definition.reverbMs);
}

export function mixVoiceAndBacking(
  voice: Float32Array,
  backing: readonly [Float32Array, Float32Array],
  balance: number,
): readonly [Float32Array, Float32Array] {
  const length = Math.max(voice.length, backing[0].length, backing[1].length);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const normalizedBalance = Math.max(0, Math.min(1, balance));
  const voiceGain = normalizedBalance * 2;
  const backingGain = (1 - normalizedBalance) * 2;
  let peak = 0;
  for (let index = 0; index < length; index += 1) {
    const vocal = (voice[index] ?? 0) * voiceGain;
    left[index] = vocal + (backing[0][index] ?? 0) * backingGain;
    right[index] = vocal + (backing[1][index] ?? 0) * backingGain;
    peak = Math.max(peak, Math.abs(left[index] ?? 0), Math.abs(right[index] ?? 0));
  }
  const targetPeak = 10 ** (-1 / 20);
  const gain = peak > targetPeak ? targetPeak / peak : 1;
  if (gain < 1) {
    for (let index = 0; index < length; index += 1) {
      left[index] = (left[index] ?? 0) * gain;
      right[index] = (right[index] ?? 0) * gain;
    }
  }
  return [left, right];
}
