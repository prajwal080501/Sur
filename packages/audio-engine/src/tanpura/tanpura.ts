import { midiToFrequency } from '../pitch/music-math.js';

export type TanpuraTuning = 'Pa' | 'Ma' | 'Ni';
export type TanpuraTempo = 'slow' | 'medium' | 'fast';

const TUNING_INTERVALS: Record<TanpuraTuning, number> = { Pa: 7, Ma: 5, Ni: 11 };
const PLUCK_INTERVALS_MS: Record<TanpuraTempo, number> = { slow: 1800, medium: 1400, fast: 1050 };

export function tanpuraFrequencies(
  saMidi: number,
  tuning: TanpuraTuning,
  fineTuneCents = 0,
): readonly [number, number, number, number] {
  const detune = fineTuneCents / 100;
  return [
    midiToFrequency(saMidi + TUNING_INTERVALS[tuning] + detune),
    midiToFrequency(saMidi + detune),
    midiToFrequency(saMidi + detune),
    midiToFrequency(saMidi + 12 + detune),
  ];
}

export class SynthTanpura {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  #saMidi: number;
  #tuning: TanpuraTuning = 'Pa';
  #tempo: TanpuraTempo = 'medium';
  #fineTuneCents = 0;
  #timer: number | null = null;
  #step = 0;

  constructor(context: AudioContext, saMidi = 49) {
    this.#context = context;
    this.#saMidi = saMidi;
    this.#output = context.createGain();
    this.#output.gain.value = 0.35;
    this.#output.connect(context.destination);
  }

  setSa(midi: number, fineTuneCents = 0): void {
    this.#saMidi = midi;
    this.#fineTuneCents = Math.max(-50, Math.min(50, fineTuneCents));
  }

  setTuning(tuning: TanpuraTuning): void {
    this.#tuning = tuning;
  }

  setTempo(tempo: TanpuraTempo): void {
    this.#tempo = tempo;
    if (this.#timer !== null) {
      this.stop();
      this.start();
    }
  }

  setVolume(value: number): void {
    this.#output.gain.setTargetAtTime(
      Math.max(0, Math.min(1, value)),
      this.#context.currentTime,
      0.02,
    );
  }

  start(): void {
    if (this.#timer !== null) return;
    this.#pluck();
    this.#timer = window.setInterval(() => this.#pluck(), PLUCK_INTERVALS_MS[this.#tempo]);
  }

  stop(): void {
    if (this.#timer !== null) window.clearInterval(this.#timer);
    this.#timer = null;
    this.#step = 0;
  }

  dispose(): void {
    this.stop();
    this.#output.disconnect();
  }

  #pluck(): void {
    const frequencies = tanpuraFrequencies(this.#saMidi, this.#tuning, this.#fineTuneCents);
    const frequency = frequencies[this.#step % frequencies.length] ?? frequencies[0];
    this.#step += 1;
    const now = this.#context.currentTime;
    const oscillator = this.#context.createOscillator();
    const overtone = this.#context.createOscillator();
    const envelope = this.#context.createGain();
    oscillator.frequency.value = frequency;
    overtone.frequency.value = frequency * 2.002;
    overtone.detune.value = 3;
    oscillator.type = 'triangle';
    overtone.type = 'sine';
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.28, now + 0.025);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    oscillator.connect(envelope);
    overtone.connect(envelope);
    envelope.connect(this.#output);
    oscillator.start(now);
    overtone.start(now);
    oscillator.stop(now + 1.85);
    overtone.stop(now + 1.85);
  }
}
