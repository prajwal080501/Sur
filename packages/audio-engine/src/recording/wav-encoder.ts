export type WavBitDepth = 16 | 24;

export interface WavInput {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  readonly bitDepth?: WavBitDepth;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeWav(input: WavInput): ArrayBuffer {
  const { channels, sampleRate } = input;
  const bitDepth = input.bitDepth ?? 16;
  if (channels.length < 1 || channels.length > 2)
    throw new RangeError('WAV requires one or two channels');
  if (!Number.isInteger(sampleRate) || sampleRate <= 0)
    throw new RangeError('sampleRate must be positive');
  const frameCount = channels[0]?.length ?? 0;
  if (channels.some((channel) => channel.length !== frameCount)) {
    throw new RangeError('all channels must have the same length');
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels.length * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame] ?? 0));
      if (bitDepth === 16) {
        const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(offset, Math.round(value), true);
        offset += 2;
      } else {
        const value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
        view.setUint8(offset, value & 0xff);
        view.setUint8(offset + 1, (value >> 8) & 0xff);
        view.setUint8(offset + 2, (value >> 16) & 0xff);
        offset += 3;
      }
    }
  }
  return buffer;
}
