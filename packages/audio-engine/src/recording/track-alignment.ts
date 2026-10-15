export interface AlignedTracks {
  readonly voice: Float32Array;
  readonly backing: readonly [Float32Array, Float32Array];
}

/** Positive offsets mean the recorded voice arrived late and must move earlier. */
export function alignRecordedTracks(
  voice: Float32Array,
  backing: readonly [Float32Array, Float32Array],
  latencyOffsetSamples: number,
): AlignedTracks {
  if (!Number.isInteger(latencyOffsetSamples)) {
    throw new RangeError('latencyOffsetSamples must be an integer');
  }
  const length = Math.max(voice.length, backing[0].length, backing[1].length);
  const alignedVoice = new Float32Array(length);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  left.set(backing[0].subarray(0, length));
  right.set(backing[1].subarray(0, length));

  for (let outputIndex = 0; outputIndex < length; outputIndex += 1) {
    const sourceIndex = outputIndex + latencyOffsetSamples;
    if (sourceIndex >= 0 && sourceIndex < voice.length) {
      alignedVoice[outputIndex] = voice[sourceIndex] ?? 0;
    }
  }
  return { voice: alignedVoice, backing: [left, right] };
}
