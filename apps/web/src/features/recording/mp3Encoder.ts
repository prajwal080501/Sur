import { Mp3Encoder } from '@breezystack/lamejs';
import { MP3_BITRATES, type Mp3Bitrate } from './mp3.js';

export interface Mp3Input {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  readonly bitrateKbps: Mp3Bitrate;
}

function floatBlockToPcm16(input: Float32Array, start: number, end: number): Int16Array {
  const output = new Int16Array(end - start);
  for (let inputIndex = start, outputIndex = 0; inputIndex < end; inputIndex += 1) {
    const sample = Math.max(-1, Math.min(1, input[inputIndex] ?? 0));
    output[outputIndex] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
    outputIndex += 1;
  }
  return output;
}

export function encodeMp3(input: Mp3Input): ArrayBuffer {
  const { channels, sampleRate, bitrateKbps } = input;
  if (channels.length < 1 || channels.length > 2) {
    throw new RangeError('MP3 requires one or two channels');
  }
  if (sampleRate !== 44_100 && sampleRate !== 48_000) {
    throw new RangeError('MP3 export supports 44.1 kHz and 48 kHz audio');
  }
  if (!MP3_BITRATES.includes(bitrateKbps)) {
    throw new RangeError('MP3 bitrate must be between 128 and 320 kbps');
  }
  const frameCount = channels[0]?.length ?? 0;
  if (channels.some((channel) => channel.length !== frameCount)) {
    throw new RangeError('all channels must have the same length');
  }

  const encoder = new Mp3Encoder(channels.length, sampleRate, bitrateKbps);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let offset = 0; offset < frameCount; offset += blockSize) {
    const end = Math.min(offset + blockSize, frameCount);
    const left = floatBlockToPcm16(channels[0] ?? new Float32Array(), offset, end);
    const right =
      channels.length === 2
        ? floatBlockToPcm16(channels[1] ?? new Float32Array(), offset, end)
        : undefined;
    const chunk = encoder.encodeBuffer(left, right);
    if (chunk.length > 0) chunks.push(chunk);
  }
  const finalChunk = encoder.flush();
  if (finalChunk.length > 0) chunks.push(finalChunk);

  const byteLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(byteLength);
  let writeOffset = 0;
  for (const chunk of chunks) {
    output.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }
  return output.buffer;
}
