import type { NoteEvent, PitchFrame } from '@sur/shared-types';
import { MpmDetector } from '../pitch/mpm.js';
import { centsFromNearestNote, frequencyToMidi } from '../pitch/music-math.js';
import { NoteSegmenter } from '../pitch/note-segmenter.js';

export interface PitchDetectorOptions {
  readonly minHz?: number;
  readonly maxHz?: number;
  readonly rmsGateDb?: number;
}

export interface PitchDetector {
  readonly algorithm: 'mpm' | 'pyin';
  init(context: AudioContext, source: AudioNode, options?: PitchDetectorOptions): Promise<void>;
  onFrame(callback: (frame: PitchFrame) => void): () => void;
  onNote(callback: (note: NoteEvent) => void): () => void;
  analyzeOffline(pcm: Float32Array, sampleRate: number): Promise<PitchFrame[]>;
  dispose(): void;
}

interface WorkletMessage {
  readonly type: 'pitch-frame';
  readonly frame: PitchFrame;
}

interface PcmChunkMessage {
  readonly type: 'pcm-chunk';
  readonly pcm: Float32Array;
  readonly length: number;
}

interface RecordingStoppedMessage {
  readonly type: 'record-stopped';
}

function isPitchMessage(value: unknown): value is WorkletMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<WorkletMessage>;
  return candidate.type === 'pitch-frame' && typeof candidate.frame?.timeMs === 'number';
}

function isPcmChunkMessage(value: unknown): value is PcmChunkMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<PcmChunkMessage>;
  return (
    candidate.type === 'pcm-chunk' &&
    candidate.pcm instanceof Float32Array &&
    typeof candidate.length === 'number'
  );
}

function isRecordingStoppedMessage(value: unknown): value is RecordingStoppedMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'record-stopped'
  );
}

export class WorkletPitchDetector implements PitchDetector {
  readonly algorithm = 'mpm' as const;
  readonly #workletUrl: string;
  readonly #frameCallbacks = new Set<(frame: PitchFrame) => void>();
  readonly #noteCallbacks = new Set<(note: NoteEvent) => void>();
  readonly #pcmChunkCallbacks = new Set<(pcm: Float32Array) => void>();
  readonly #noteSegmenter = new NoteSegmenter();
  #node: AudioWorkletNode | null = null;
  #silentOutput: GainNode | null = null;
  #source: AudioNode | null = null;
  #recordedChunks: Float32Array[] = [];
  #stopRecordingResolve: ((pcm: Float32Array) => void) | null = null;

  constructor(workletUrl: string) {
    this.#workletUrl = workletUrl;
  }

  async init(
    context: AudioContext,
    source: AudioNode,
    options: PitchDetectorOptions = {},
  ): Promise<void> {
    this.dispose();
    await context.audioWorklet.addModule(this.#workletUrl);
    const node = new window.AudioWorkletNode(context, 'sur-pitch-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        minHz: options.minHz ?? 80,
        maxHz: options.maxHz ?? 1000,
        rmsGateDb: options.rmsGateDb ?? -55,
      },
    });
    const silentOutput = context.createGain();
    silentOutput.gain.value = 0;
    node.port.onmessage = (event: MessageEvent<unknown>) => {
      if (isPitchMessage(event.data)) {
        for (const callback of this.#frameCallbacks) callback(event.data.frame);
        const note = this.#noteSegmenter.push(event.data.frame);
        if (note) for (const callback of this.#noteCallbacks) callback(note);
        return;
      }
      if (isPcmChunkMessage(event.data)) {
        const chunk = event.data.pcm.slice(0, event.data.length);
        this.#recordedChunks.push(chunk);
        for (const callback of this.#pcmChunkCallbacks) callback(chunk);
        return;
      }
      if (isRecordingStoppedMessage(event.data)) this.#finishRecording();
    };
    source.connect(node);
    node.connect(silentOutput);
    silentOutput.connect(context.destination);
    this.#source = source;
    this.#node = node;
    this.#silentOutput = silentOutput;
  }

  onFrame(callback: (frame: PitchFrame) => void): () => void {
    this.#frameCallbacks.add(callback);
    return () => this.#frameCallbacks.delete(callback);
  }

  onNote(callback: (note: NoteEvent) => void): () => void {
    this.#noteCallbacks.add(callback);
    return () => this.#noteCallbacks.delete(callback);
  }

  onPcmChunk(callback: (pcm: Float32Array) => void): () => void {
    this.#pcmChunkCallbacks.add(callback);
    return () => {
      this.#pcmChunkCallbacks.delete(callback);
    };
  }

  startRecording(): void {
    if (!this.#node) throw new Error('Pitch detector must be initialized before recording');
    if (this.#stopRecordingResolve) throw new Error('A recording stop is already pending');
    this.#recordedChunks = [];
    this.#node.port.postMessage({ type: 'record-start' });
  }

  stopRecording(): Promise<Float32Array> {
    if (!this.#node) return Promise.reject(new Error('Pitch detector is not initialized'));
    if (this.#stopRecordingResolve)
      return Promise.reject(new Error('Recording stop already requested'));
    return new Promise((resolve) => {
      this.#stopRecordingResolve = resolve;
      this.#node?.port.postMessage({ type: 'record-stop' });
    });
  }

  async analyzeOffline(pcm: Float32Array, sampleRate: number): Promise<PitchFrame[]> {
    const frameSize = 4096;
    const hopSize = 512;
    const detector = new MpmDetector(sampleRate, frameSize);
    const window = new Float32Array(frameSize);
    const frames: PitchFrame[] = [];
    for (let offset = 0; offset + frameSize <= pcm.length; offset += hopSize) {
      window.set(pcm.subarray(offset, offset + frameSize));
      const result = detector.analyze(window);
      const midi = result.frequencyHz === null ? null : frequencyToMidi(result.frequencyHz);
      frames.push({
        timeMs: (offset / sampleRate) * 1000,
        f0Hz: result.frequencyHz,
        midi,
        cents: midi === null ? null : centsFromNearestNote(midi),
        confidence: result.clarity,
        rms: result.rms,
      });
    }
    return Promise.resolve(frames);
  }

  dispose(): void {
    if (this.#node) {
      this.#node.port.onmessage = null;
      this.#node.disconnect();
      this.#source?.disconnect(this.#node);
    }
    this.#silentOutput?.disconnect();
    this.#node = null;
    this.#silentOutput = null;
    this.#source = null;
    this.#noteSegmenter.reset();
    if (this.#stopRecordingResolve) this.#finishRecording();
  }

  #finishRecording(): void {
    const length = this.#recordedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const pcm = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.#recordedChunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.#recordedChunks = [];
    this.#stopRecordingResolve?.(pcm);
    this.#stopRecordingResolve = null;
  }
}
