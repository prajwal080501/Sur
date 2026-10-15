import { encodeWav, normalizeLoudness } from '@sur/audio-engine';
import type { Mp3Bitrate } from './mp3.js';
import { encodeMp3 } from './mp3Encoder.js';

interface NormalizeRequest {
  readonly type: 'normalize';
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly sampleRate: number;
  readonly targetLufs: number;
  readonly truePeakDbtp: number;
  readonly format: 'wav' | 'mp3';
  readonly bitrateKbps?: Mp3Bitrate;
}

interface EncodeWavRequest {
  readonly type: 'encode-wav';
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  readonly bitDepth: 16 | 24;
}

const postTransfer = (message: unknown, buffers: readonly ArrayBuffer[]) => {
  const scope = self as unknown as {
    postMessage(value: unknown, options: { transfer: Transferable[] }): void;
  };
  scope.postMessage(message, { transfer: [...buffers] });
};

self.onmessage = (event: MessageEvent<NormalizeRequest | EncodeWavRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'encode-wav') {
      const file = encodeWav(request);
      postTransfer({ type: 'encoded', file }, [file]);
      return;
    }
    const normalized = normalizeLoudness(
      [request.left, request.right],
      request.sampleRate,
      request.targetLufs,
      request.truePeakDbtp,
    );
    const [left, right] = normalized.channels;
    if (!left || !right) throw new Error('Stereo normalization did not return two channels');
    const file =
      request.format === 'mp3'
        ? encodeMp3({
            channels: [left, right],
            sampleRate: request.sampleRate,
            bitrateKbps: request.bitrateKbps ?? 192,
          })
        : encodeWav({ channels: [left, right], sampleRate: request.sampleRate, bitDepth: 24 });
    postTransfer(
      {
        type: 'normalized',
        file,
        format: request.format,
        integratedLufs: normalized.integratedLufs,
        truePeakDbtp: normalized.truePeakDbtp,
        appliedGainDb: normalized.appliedGainDb,
      },
      [file],
    );
  } catch (reason) {
    self.postMessage({
      type: 'error',
      message: reason instanceof Error ? reason.message : 'Unable to export audio',
    });
  }
};
