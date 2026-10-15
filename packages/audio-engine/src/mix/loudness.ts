export interface LoudnessMeasurement {
  readonly integratedLufs: number;
  readonly truePeakDbtp: number;
}

export interface NormalizedAudio extends LoudnessMeasurement {
  readonly channels: readonly Float32Array[];
  readonly appliedGainDb: number;
}

interface BiquadCoefficients {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly a1: number;
  readonly a2: number;
}

const K_WEIGHTING: Record<44100 | 48000, readonly [BiquadCoefficients, BiquadCoefficients]> = {
  48000: [
    {
      b0: 1.53512485958697,
      b1: -2.69169618940638,
      b2: 1.19839281085285,
      a1: -1.69065929318241,
      a2: 0.73248077421585,
    },
    {
      b0: 1,
      b1: -2,
      b2: 1,
      a1: -1.99004745483398,
      a2: 0.99007225036621,
    },
  ],
  44100: [
    {
      b0: 1.53084123005035,
      b1: -2.65097999515473,
      b2: 1.16907907992159,
      a1: -1.66365511325602,
      a2: 0.712595428073225,
    },
    {
      b0: 1,
      b1: -2,
      b2: 1,
      a1: -1.9891696736298,
      a2: 0.989199035787039,
    },
  ],
};

function coefficientsFor(sampleRate: number) {
  if (sampleRate !== 44_100 && sampleRate !== 48_000) {
    throw new RangeError('Loudness measurement supports 44.1 kHz and 48 kHz audio');
  }
  return K_WEIGHTING[sampleRate];
}

function filter(input: Float32Array, coefficients: BiquadCoefficients): Float64Array {
  const output = new Float64Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < input.length; index += 1) {
    const x0 = input[index] ?? 0;
    const y0 =
      coefficients.b0 * x0 +
      coefficients.b1 * x1 +
      coefficients.b2 * x2 -
      coefficients.a1 * y1 -
      coefficients.a2 * y2;
    output[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

function filterKWeighting(input: Float32Array, sampleRate: number): Float64Array {
  const [shelf, highPass] = coefficientsFor(sampleRate);
  const shelfOutput = filter(input, shelf);
  return filter(Float32Array.from(shelfOutput), highPass);
}

function loudnessFromEnergy(energy: number): number {
  return energy <= 0 ? Number.NEGATIVE_INFINITY : -0.691 + 10 * Math.log10(energy);
}

function gatedIntegratedLufs(channels: readonly Float32Array[], sampleRate: number): number {
  if (channels.length === 0) return Number.NEGATIVE_INFINITY;
  const weighted = channels.map((channel) => filterKWeighting(channel, sampleRate));
  const length = Math.max(...weighted.map((channel) => channel.length), 0);
  const blockLength = Math.round(sampleRate * 0.4);
  const hopLength = Math.round(blockLength * 0.25);
  const blockEnergies: number[] = [];
  for (let start = 0; start < Math.max(1, length); start += hopLength) {
    if (start > 0 && start + blockLength > length) break;
    let energy = 0;
    for (const channel of weighted) {
      let channelEnergy = 0;
      const end = Math.min(start + blockLength, channel.length);
      for (let index = start; index < end; index += 1) {
        const sample = channel[index] ?? 0;
        channelEnergy += sample * sample;
      }
      energy += channelEnergy / blockLength;
    }
    blockEnergies.push(energy);
  }
  const aboveAbsoluteGate = blockEnergies.filter((energy) => loudnessFromEnergy(energy) >= -70);
  if (aboveAbsoluteGate.length === 0) return Number.NEGATIVE_INFINITY;
  const absoluteMean =
    aboveAbsoluteGate.reduce((sum, energy) => sum + energy, 0) / aboveAbsoluteGate.length;
  const relativeGate = loudnessFromEnergy(absoluteMean) - 10;
  const gated = aboveAbsoluteGate.filter((energy) => loudnessFromEnergy(energy) >= relativeGate);
  const gatedMean = gated.reduce((sum, energy) => sum + energy, 0) / gated.length;
  return loudnessFromEnergy(gatedMean);
}

function estimateTruePeak(channels: readonly Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const current = channel[index] ?? 0;
      const next = channel[index + 1] ?? current;
      for (let phase = 0; phase < 4; phase += 1) {
        peak = Math.max(peak, Math.abs(current + ((next - current) * phase) / 4));
      }
    }
  }
  return peak;
}

export function measureLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
): LoudnessMeasurement {
  const integratedLufs = gatedIntegratedLufs(channels, sampleRate);
  const peak = estimateTruePeak(channels);
  return {
    integratedLufs,
    truePeakDbtp: peak > 0 ? 20 * Math.log10(peak) : Number.NEGATIVE_INFINITY,
  };
}

export function normalizeLoudness(
  channels: readonly Float32Array[],
  sampleRate: number,
  targetLufs = -14,
  maximumTruePeakDbtp = -1,
): NormalizedAudio {
  const before = measureLoudness(channels, sampleRate);
  const loudnessGainDb = Number.isFinite(before.integratedLufs)
    ? targetLufs - before.integratedLufs
    : 0;
  const peakGainDb = Number.isFinite(before.truePeakDbtp)
    ? maximumTruePeakDbtp - before.truePeakDbtp
    : 0;
  const appliedGainDb = Math.min(loudnessGainDb, peakGainDb);
  const gain = 10 ** (appliedGainDb / 20);
  const normalized = channels.map((channel) =>
    Float32Array.from(channel, (sample) => sample * gain),
  );
  const after = measureLoudness(normalized, sampleRate);
  return { channels: normalized, appliedGainDb, ...after };
}
