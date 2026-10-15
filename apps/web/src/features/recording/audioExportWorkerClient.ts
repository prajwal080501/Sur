import type { Mp3Bitrate } from './mp3.js';

interface NormalizedMessage {
  readonly type: 'normalized';
  readonly file: ArrayBuffer;
  readonly format: 'wav' | 'mp3';
  readonly integratedLufs: number;
  readonly truePeakDbtp: number;
  readonly appliedGainDb: number;
}

interface EncodedMessage {
  readonly type: 'encoded';
  readonly file: ArrayBuffer;
}

interface ErrorMessage {
  readonly type: 'error';
  readonly message: string;
}

export interface WorkerNormalizedMix {
  readonly file: ArrayBuffer;
  readonly format: 'wav' | 'mp3';
  readonly integratedLufs: number;
  readonly truePeakDbtp: number;
  readonly appliedGainDb: number;
}

function createExportWorker(): Worker {
  return new Worker(new URL('./export.worker.ts', import.meta.url), { type: 'module' });
}

export function encodeWavInWorker(
  channels: readonly Float32Array[],
  sampleRate: number,
  bitDepth: 16 | 24 = 24,
): Promise<ArrayBuffer> {
  const worker = createExportWorker();
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<EncodedMessage | ErrorMessage>) => {
      worker.terminate();
      if (event.data.type === 'error') {
        reject(new Error(event.data.message));
        return;
      }
      resolve(event.data.file);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'WAV export worker failed'));
    };
    worker.postMessage({ type: 'encode-wav', channels, sampleRate, bitDepth });
  });
}

export function normalizeMixInWorker(
  channels: readonly [Float32Array, Float32Array],
  sampleRate: number,
  format: 'wav' | 'mp3',
  bitrateKbps?: Mp3Bitrate,
  targetLufs = -14,
  truePeakDbtp = -1,
): Promise<WorkerNormalizedMix> {
  const worker = createExportWorker();
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<NormalizedMessage | ErrorMessage>) => {
      worker.terminate();
      if (event.data.type === 'error') {
        reject(new Error(event.data.message));
        return;
      }
      resolve({
        file: event.data.file,
        format: event.data.format,
        integratedLufs: event.data.integratedLufs,
        truePeakDbtp: event.data.truePeakDbtp,
        appliedGainDb: event.data.appliedGainDb,
      });
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Audio export worker failed'));
    };
    worker.postMessage({
      type: 'normalize',
      left: channels[0],
      right: channels[1],
      sampleRate,
      targetLufs,
      truePeakDbtp,
      format,
      bitrateKbps,
    });
  });
}
