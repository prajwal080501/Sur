import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { encodeWav, normalizeLoudness } from '../packages/audio-engine/dist/index.js';

const SAMPLE_RATE = 48_000;
const TARGET_LUFS = -14;
const MAX_TRUE_PEAK_DBTP = -1;

function programChannel(phaseOffset) {
  return Float32Array.from({ length: SAMPLE_RATE * 8 }, (_, index) => {
    const time = index / SAMPLE_RATE;
    return (
      0.12 *
      (Math.sin(2 * Math.PI * 220 * time + phaseOffset) * 0.65 +
        Math.sin(2 * Math.PI * 997 * time + phaseOffset * 0.5) * 0.35)
    );
  });
}

function parseLoudnormReport(stderr) {
  const reports = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g);
  const raw = reports?.at(-1);
  if (!raw) throw new Error(`ffmpeg did not emit a loudnorm report:\n${stderr}`);
  return JSON.parse(raw);
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'sur-loudness-'));
try {
  const normalized = normalizeLoudness(
    [programChannel(0), programChannel(Math.PI / 3)],
    SAMPLE_RATE,
    TARGET_LUFS,
    MAX_TRUE_PEAK_DBTP,
  );
  const wav = encodeWav({ channels: normalized.channels, sampleRate: SAMPLE_RATE, bitDepth: 24 });
  const fixturePath = join(temporaryDirectory, 'normalized-fixture.wav');
  writeFileSync(fixturePath, Buffer.from(wav));

  const result = spawnSync(
    'ffmpeg',
    [
      '-nostdin',
      '-hide_banner',
      '-nostats',
      '-i',
      fixturePath,
      '-af',
      `loudnorm=I=${TARGET_LUFS}:TP=${MAX_TRUE_PEAK_DBTP}:LRA=11:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `ffmpeg exited ${result.status}`);

  const report = parseLoudnormReport(result.stderr);
  const measuredLufs = Number(report.input_i);
  const measuredTruePeak = Number(report.input_tp);
  if (Math.abs(measuredLufs - TARGET_LUFS) > 0.5) {
    throw new Error(`Integrated loudness ${measuredLufs} LUFS is outside −14 ± 0.5 LUFS`);
  }
  if (measuredTruePeak > MAX_TRUE_PEAK_DBTP) {
    throw new Error(`True peak ${measuredTruePeak} dBTP exceeds −1 dBTP`);
  }
  process.stdout.write(
    `ffmpeg loudnorm verified: ${measuredLufs.toFixed(2)} LUFS, ${measuredTruePeak.toFixed(2)} dBTP\n`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
