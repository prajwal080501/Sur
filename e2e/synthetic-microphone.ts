import type { Page } from '@playwright/test';

export async function installSyntheticMicrophone(page: Page): Promise<void> {
  if (process.platform !== 'darwin') return;
  await page.addInitScript(() => {
    const originalBufferSourceStart = Object.getOwnPropertyDescriptor(
      AudioBufferSourceNode.prototype,
      'start',
    )?.value as AudioBufferSourceNode['start'];
    AudioBufferSourceNode.prototype.start = function (...args) {
      const testWindow = window as unknown as {
        __surStartedAudioSamples?: number;
        __surStartedNonSilentSamples?: number;
      };
      testWindow.__surStartedAudioSamples = (testWindow.__surStartedAudioSamples ?? 0) + 1;
      const channel = this.buffer?.getChannelData(0);
      if (channel?.some((sample) => Math.abs(sample) > 0.0001)) {
        testWindow.__surStartedNonSilentSamples =
          (testWindow.__surStartedNonSilentSamples ?? 0) + 1;
      }
      return Reflect.apply(originalBufferSourceStart, this, args);
    };

    AudioContext.prototype.createMediaStreamSource = function () {
      return {
        connect: () => undefined,
        disconnect: () => undefined,
      } as unknown as MediaStreamAudioSourceNode;
    };

    class SyntheticWorkletNode {
      readonly port: {
        onmessage: ((event: MessageEvent<unknown>) => void) | null;
        postMessage: (message: { type?: string }) => void;
      };
      readonly timer: number;
      recordingStartedAt: number | null = null;

      constructor() {
        const testWindow = window as unknown as {
          __surSyntheticWorkletInstances?: number;
          __surSyntheticFrames?: number;
          __surStartedAudioSamples?: number;
          __surStartedNonSilentSamples?: number;
        };
        testWindow.__surSyntheticWorkletInstances =
          (testWindow.__surSyntheticWorkletInstances ?? 0) + 1;
        this.port = {
          onmessage: null,
          postMessage: (message) => {
            if (message.type === 'record-start') this.recordingStartedAt = performance.now();
            if (message.type === 'record-stop') this.finishRecording();
          },
        };
        this.timer = window.setInterval(() => {
          testWindow.__surSyntheticFrames = (testWindow.__surSyntheticFrames ?? 0) + 1;
          const timeMs = performance.now();
          const voiced = Math.floor(timeMs / 500) % 2 === 0;
          this.port.onmessage?.({
            data: {
              type: 'pitch-frame',
              frame: {
                timeMs,
                f0Hz: voiced ? 440 : null,
                midi: voiced ? 69 : null,
                cents: voiced ? 0 : null,
                confidence: voiced ? 0.99 : 0,
                rms: voiced ? 0.25 : 0,
              },
            },
          } as MessageEvent<unknown>);
        }, 20);
      }

      connect() {
        return this;
      }

      disconnect() {
        window.clearInterval(this.timer);
      }

      finishRecording() {
        const durationMs = Math.max(100, performance.now() - (this.recordingStartedAt ?? 0));
        const pcm = Float32Array.from(
          { length: Math.round(durationMs * 48) },
          (_, index) => Math.sin((2 * Math.PI * 440 * index) / 48_000) * 0.35,
        );
        this.port.onmessage?.({
          data: { type: 'pcm-chunk', pcm, length: pcm.length },
        } as MessageEvent<unknown>);
        this.port.onmessage?.({ data: { type: 'record-stopped' } } as MessageEvent<unknown>);
        this.recordingStartedAt = null;
      }
    }

    Object.defineProperty(window, 'AudioWorkletNode', {
      configurable: true,
      value: SyntheticWorkletNode,
    });
    (window as unknown as { __surSyntheticWorklet?: boolean }).__surSyntheticWorklet = true;
  });
}
