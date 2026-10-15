import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const syntheticMicPath = join(tmpdir(), 'sur-e2e-synthetic-mic.wav');

export default function globalSetup() {
  const sampleRate = 48_000;
  const durationSeconds = 20;
  const frameCount = sampleRate * durationSeconds;
  const buffer = Buffer.alloc(44 + frameCount * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + frameCount * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frameCount * 2, 40);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 0.35;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + frame * 2);
  }
  writeFileSync(syntheticMicPath, buffer);
}
