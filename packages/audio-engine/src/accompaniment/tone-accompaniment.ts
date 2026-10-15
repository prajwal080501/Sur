import type { ChordEvent } from '@sur/shared-types';
import * as Tone from 'tone';
import {
  chordPattern,
  rhythmHits,
  type AccompanimentStyle,
  type NoteOrder,
  type PercussionVoice,
  type RhythmStyle,
} from './patterns.js';
import {
  millisecondsPerBeat,
  nextDecisionTarget,
  quarterIndexToPosition,
} from './transport-math.js';

export type { AccompanimentStyle, RhythmStyle } from './patterns.js';

/** Use the page AudioContext so samplers and the transport share the resumed clock. */
export function bindAccompanimentContext(context: AudioContext): void {
  Tone.setContext(context);
}

export interface BeatEvent {
  readonly bar: number;
  readonly beat: 1 | 2 | 3 | 4;
  readonly tMs: number;
}

export interface DecisionTarget {
  readonly bar: number;
  readonly beat: 1 | 3;
  readonly tMs: number;
  readonly audioTime: number;
}

const SAMPLE_NOTES = ['C3', 'C4', 'C5'] as const;
const SAMPLE_FREQUENCIES = [130.8128, 261.6256, 523.2511] as const;
const PERCUSSION_VOICES: readonly PercussionVoice[] = [
  'tabla-bass',
  'tabla-treble',
  'kick',
  'snare',
  'hat',
];

export interface RecordedSamples {
  readonly piano: Readonly<Record<string, string>>;
  readonly guitar: Readonly<Record<string, string>>;
  readonly percussion: Readonly<Record<PercussionVoice, string>>;
}

function whenReady<T extends { loaded: boolean }>(
  create: (handlers: { onload: () => void; onerror: (error: Error) => void }) => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let created: T | null = null;
    const succeed = () => {
      if (settled || !created) return;
      settled = true;
      resolve(created);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('Unable to load sample'));
    };
    created = create({ onload: succeed, onerror: fail });
    if (created.loaded) succeed();
  });
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function deterministicNoise(index: number, seed: number): number {
  const value = Math.sin((index + 1) * (12.9898 + seed * 0.371)) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function createMonoBuffer(
  durationSeconds: number,
  render: (time: number, index: number) => number,
) {
  const context = Tone.getContext().rawContext;
  const sampleRate = context.sampleRate;
  const frameCount = Math.ceil(durationSeconds * sampleRate);
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = clampUnit((render(index / sampleRate, index) + 1) / 2) * 2 - 1;
  }
  return buffer;
}

function createHarmonicSample(style: AccompanimentStyle, frequency: number): AudioBuffer {
  const duration = style === 'pad' ? 6 : style === 'piano' ? 3.5 : 2.5;
  return createMonoBuffer(duration, (time, index) => {
    const attack = Math.min(1, time / (style === 'pad' ? 0.22 : 0.008));
    const release = Math.min(1, (duration - time) / (style === 'pad' ? 1.4 : 0.35));
    const decay = style === 'pad' ? 0.72 + 0.28 * Math.exp(-time / 3.5) : Math.exp(-time / 1.15);
    const fundamental = Math.sin(2 * Math.PI * frequency * time);
    const second = Math.sin(2 * Math.PI * frequency * 2 * time + 0.13);
    const third = Math.sin(2 * Math.PI * frequency * 3 * time + 0.31);
    const hammer = deterministicNoise(index, frequency) * Math.exp(-time / 0.018);
    const body =
      style === 'pad'
        ? fundamental * 0.64 + second * 0.23 + third * 0.08
        : style === 'piano'
          ? fundamental * 0.68 + second * 0.2 + third * 0.08 + hammer * 0.08
          : fundamental * 0.58 + second * 0.27 + third * 0.12 + hammer * 0.04;
    return body * attack * release * decay * 0.82;
  });
}

function createPercussionSample(voice: PercussionVoice): AudioBuffer {
  const duration = voice === 'hat' ? 0.18 : voice === 'snare' ? 0.34 : 0.55;
  return createMonoBuffer(duration, (time, index) => {
    const noise = deterministicNoise(index, PERCUSSION_VOICES.indexOf(voice) + 1);
    if (voice === 'hat') return noise * Math.exp(-time / 0.045) * 0.48;
    if (voice === 'snare') {
      const tone = Math.sin(2 * Math.PI * 185 * time);
      return (noise * 0.72 + tone * 0.28) * Math.exp(-time / 0.095) * 0.65;
    }
    const baseFrequency = voice === 'kick' ? 78 : voice === 'tabla-bass' ? 112 : 238;
    const sweep = baseFrequency * (1 + 1.7 * Math.exp(-time / 0.045));
    const resonant = Math.sin(2 * Math.PI * sweep * time);
    const overtone = Math.sin(2 * Math.PI * baseFrequency * 1.73 * time);
    const transient = noise * Math.exp(-time / 0.016);
    const decay = voice === 'tabla-treble' ? 0.105 : 0.18;
    return (resonant * 0.72 + overtone * 0.18 + transient * 0.16) * Math.exp(-time / decay) * 0.72;
  });
}

function createSampler(
  style: AccompanimentStyle,
  samples: RecordedSamples | null,
): Promise<Tone.Sampler> {
  const release = style === 'pad' ? 1.2 : style === 'piano' ? 0.45 : 0.18;
  const attack = style === 'pad' ? 0.18 : 0;
  const urls = samples
    ? { ...(style === 'strum' ? samples.guitar : samples.piano) }
    : Object.fromEntries(
        SAMPLE_NOTES.map((note, index) => [
          note,
          createHarmonicSample(style, SAMPLE_FREQUENCIES[index] ?? SAMPLE_FREQUENCIES[0]),
        ]),
      );
  return whenReady((handlers) => new Tone.Sampler({ urls, attack, release, ...handlers }));
}

function createPercussion(samples: RecordedSamples | null): Promise<Tone.Players> {
  const urls = samples
    ? { ...samples.percussion }
    : Object.fromEntries(PERCUSSION_VOICES.map((voice) => [voice, createPercussionSample(voice)]));
  return whenReady((handlers) => new Tone.Players({ urls, ...handlers }));
}

function orderNotes(notes: readonly string[], order: NoteOrder): readonly string[] {
  if (order === 'block') return notes;
  const sorted = [...notes].sort(
    (left, right) => Tone.Frequency(left).toMidi() - Tone.Frequency(right).toMidi(),
  );
  return order === 'ascending' ? sorted : sorted.reverse();
}

export class ToneAccompanimentEngine {
  readonly #beatCallbacks = new Set<(event: BeatEvent) => void>();
  readonly #countInCallbacks = new Set<() => void>();
  readonly #decisionCallbacks = new Set<(target: DecisionTarget) => void>();
  readonly #output = new Tone.Gain(0.82).toDestination();
  readonly #harmonyGain = new Tone.Gain(0.62).connect(this.#output);
  readonly #rhythmGain = new Tone.Gain(0.7).connect(this.#output);
  readonly #metronome = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    volume: -15,
  }).connect(this.#output);
  #sampler: Tone.Sampler | null = null;
  #pendingSampler: Tone.Sampler | null = null;
  #percussion: Tone.Players | null = null;
  #style: AccompanimentStyle = 'pad';
  #pendingStyle: AccompanimentStyle | null = null;
  #rhythm: RhythmStyle = 'none';
  #bpm = 90;
  #pendingBpm: number | null = null;
  #quarterIndex = 0;
  #rhythmEighthIndex = 0;
  #countInQuarters = 0;
  #repeatId: number | null = null;
  #startedAtAudioTime = 0;
  #countInComplete = false;
  #countInFallback: ReturnType<typeof setTimeout> | null = null;
  #samples: RecordedSamples | null = null;

  async load(style: AccompanimentStyle, samples?: RecordedSamples): Promise<void> {
    await Tone.start();
    if (samples) this.#samples = samples;
    const nextSampler = (await createSampler(style, this.#samples)).connect(this.#harmonyGain);
    if (!this.#percussion) {
      this.#percussion = (await createPercussion(this.#samples)).connect(this.#rhythmGain);
    }
    if (this.#repeatId !== null && this.#sampler) {
      this.#pendingSampler?.dispose();
      this.#pendingSampler = nextSampler;
      this.#pendingStyle = style;
      return;
    }
    this.#sampler?.dispose();
    this.#sampler = nextSampler;
    this.#style = style;
  }

  setTempo(bpm: number): void {
    if (!Number.isFinite(bpm) || bpm < 50 || bpm > 180) {
      throw new RangeError('bpm must be between 50 and 180');
    }
    if (this.#repeatId === null) {
      this.#bpm = bpm;
      Tone.getTransport().bpm.value = bpm;
    } else {
      this.#pendingBpm = bpm;
    }
  }

  setRhythm(style: RhythmStyle): void {
    this.#rhythm = style;
    this.#rhythmEighthIndex = 0;
  }

  setVolume(value: number): void {
    this.#output.gain.rampTo(clampUnit(value), 0.03);
  }

  setHarmonyVolume(value: number): void {
    this.#harmonyGain.gain.rampTo(clampUnit(value), 0.03);
  }

  setRhythmVolume(value: number): void {
    this.#rhythmGain.gain.rampTo(clampUnit(value), 0.03);
  }

  start(options: { countInBars?: number } = {}): void {
    if (!this.#sampler || !this.#percussion) throw new Error('load() must complete before start()');
    if (this.#repeatId !== null) return;
    const transport = Tone.getTransport();
    transport.bpm.value = this.#bpm;
    this.#quarterIndex = 0;
    this.#rhythmEighthIndex = 0;
    this.#countInQuarters = (options.countInBars ?? 1) * 4;
    this.#countInComplete = false;
    this.#startedAtAudioTime = Tone.now() + 0.1;
    this.#repeatId = transport.scheduleRepeat((time) => this.#onQuarter(time), '4n');
    transport.start(this.#startedAtAudioTime);
    const fallbackDelayMs = 100 + this.#countInQuarters * millisecondsPerBeat(this.#bpm) + 250;
    this.#countInFallback = setTimeout(() => this.#emitCountInComplete(), fallbackDelayMs);
    const firstBeatAudioTime =
      this.#startedAtAudioTime + this.#countInQuarters * (millisecondsPerBeat(this.#bpm) / 1000);
    for (const callback of this.#decisionCallbacks) {
      callback({
        bar: 1,
        beat: 1,
        tMs: (firstBeatAudioTime - this.#startedAtAudioTime) * 1000,
        audioTime: firstBeatAudioTime,
      });
    }
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    if (this.#repeatId !== null) transport.clear(this.#repeatId);
    this.#repeatId = null;
    if (this.#countInFallback !== null) clearTimeout(this.#countInFallback);
    this.#countInFallback = null;
    this.#sampler?.releaseAll();
    this.#pendingSampler?.dispose();
    this.#pendingSampler = null;
    this.#pendingStyle = null;
  }

  playChord(chord: ChordEvent, audioTime: number): void {
    this.#activatePendingSampler();
    if (!this.#sampler) return;
    const beatSeconds = millisecondsPerBeat(this.#bpm) / 1000;
    const notes = chord.pitches.map((midi) => Tone.Frequency(midi, 'midi').toNote());
    for (const strike of chordPattern(this.#style)) {
      const ordered = orderNotes(notes, strike.noteOrder);
      ordered.forEach((note, index) => {
        const spread = strike.noteOrder === 'block' ? 0 : index * strike.spreadBeats * beatSeconds;
        this.#sampler?.triggerAttackRelease(
          note,
          strike.durationBeats * beatSeconds,
          audioTime + strike.atBeats * beatSeconds + spread,
          strike.velocity,
        );
      });
    }
  }

  onBeat(callback: (event: BeatEvent) => void): () => void {
    this.#beatCallbacks.add(callback);
    return () => this.#beatCallbacks.delete(callback);
  }

  onCountInComplete(callback: () => void): () => void {
    this.#countInCallbacks.add(callback);
    return () => this.#countInCallbacks.delete(callback);
  }

  onDecisionTarget(callback: (target: DecisionTarget) => void): () => void {
    this.#decisionCallbacks.add(callback);
    return () => this.#decisionCallbacks.delete(callback);
  }

  transportOriginMs(): number | null {
    return this.#repeatId === null ? null : this.#startedAtAudioTime * 1000;
  }

  dispose(): void {
    this.stop();
    this.#sampler?.dispose();
    this.#percussion?.dispose();
    this.#metronome.dispose();
    this.#harmonyGain.dispose();
    this.#rhythmGain.dispose();
    this.#output.dispose();
  }

  #activatePendingSampler(): void {
    if (!this.#pendingSampler || !this.#pendingStyle) return;
    const previous = this.#sampler;
    this.#sampler = this.#pendingSampler;
    this.#style = this.#pendingStyle;
    this.#pendingSampler = null;
    this.#pendingStyle = null;
    previous?.releaseAll();
    previous?.dispose();
  }

  #playRhythmEighth(audioTime: number): void {
    if (!this.#percussion) return;
    for (const hit of rhythmHits(this.#rhythm, this.#rhythmEighthIndex)) {
      const player = this.#percussion.player(hit.voice);
      player.volume.value = Tone.gainToDb(hit.velocity);
      player.start(audioTime);
    }
    this.#rhythmEighthIndex += 1;
  }

  #onQuarter(audioTime: number): void {
    if (this.#countInQuarters > 0) {
      const accent = this.#countInQuarters % 4 === 0;
      this.#metronome.triggerAttackRelease(accent ? 'C6' : 'G5', 0.045, audioTime);
      this.#countInQuarters -= 1;
      return;
    }
    const position = quarterIndexToPosition(this.#quarterIndex);
    this.#quarterIndex += 1;
    if (!this.#countInComplete)
      Tone.getDraw().schedule(() => this.#emitCountInComplete(), audioTime);
    if (position.beat === 1 && this.#pendingBpm !== null) {
      this.#bpm = this.#pendingBpm;
      this.#pendingBpm = null;
      Tone.getTransport().bpm.value = this.#bpm;
    }
    const eighthSeconds = millisecondsPerBeat(this.#bpm) / 2000;
    this.#playRhythmEighth(audioTime);
    this.#playRhythmEighth(audioTime + eighthSeconds);
    const tMs = (audioTime - this.#startedAtAudioTime) * 1000;
    Tone.getDraw().schedule(() => {
      for (const callback of this.#beatCallbacks) callback({ ...position, tMs });
    }, audioTime);
    const target = nextDecisionTarget(position);
    if (!target) return;
    const targetAudioTime = audioTime + millisecondsPerBeat(this.#bpm) / 1000;
    const decision = {
      ...target,
      tMs: (targetAudioTime - this.#startedAtAudioTime) * 1000,
      audioTime: targetAudioTime,
    };
    for (const callback of this.#decisionCallbacks) callback(decision);
  }

  #emitCountInComplete(): void {
    if (this.#countInComplete) return;
    this.#countInComplete = true;
    if (this.#countInFallback !== null) clearTimeout(this.#countInFallback);
    this.#countInFallback = null;
    for (const callback of this.#countInCallbacks) callback();
  }
}
