export interface MpmOptions {
  readonly minHz?: number;
  readonly maxHz?: number;
  readonly clarityThreshold?: number;
  readonly rmsGateDb?: number;
}

export interface MpmResult {
  readonly frequencyHz: number | null;
  readonly clarity: number;
  readonly rms: number;
}

/**
 * McLeod Pitch Method core. The reusable NSDF buffer avoids allocations in the
 * analysis path so this class can be hosted by an AudioWorklet adapter.
 */
export class MpmDetector {
  readonly #nsdf: Float32Array;
  readonly #minHz: number;
  readonly #maxHz: number;
  readonly #clarityThreshold: number;
  readonly #rmsGateLinear: number;

  constructor(
    readonly sampleRate: number,
    readonly frameSize: number,
    options: MpmOptions = {},
  ) {
    if (sampleRate <= 0 || frameSize < 256) throw new RangeError('invalid detector dimensions');
    this.#minHz = options.minHz ?? 80;
    this.#maxHz = options.maxHz ?? 1000;
    this.#clarityThreshold = options.clarityThreshold ?? 0.9;
    this.#rmsGateLinear = 10 ** ((options.rmsGateDb ?? -55) / 20);
    this.#nsdf = new Float32Array(frameSize);
  }

  analyze(frame: Float32Array): MpmResult {
    if (frame.length !== this.frameSize)
      throw new RangeError('frame length does not match frameSize');

    let energy = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const sample = frame[index] ?? 0;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / frame.length);
    if (rms < this.#rmsGateLinear) return { frequencyHz: null, clarity: 0, rms };

    const minLag = Math.max(2, Math.floor(this.sampleRate / this.#maxHz));
    const analysisStartLag = minLag - 1;
    // Include one sample beyond the requested minimum so the final in-range lag
    // can be confirmed as a local maximum.
    const maxLag = Math.min(frame.length - 2, Math.ceil(this.sampleRate / this.#minHz) + 1);
    let bestLag = -1;
    let bestClarity = 0;

    for (let lag = analysisStartLag; lag <= maxLag; lag += 1) {
      let acf = 0;
      let divisor = 0;
      const overlap = frame.length - lag;
      for (let index = 0; index < overlap; index += 1) {
        const left = frame[index] ?? 0;
        const right = frame[index + lag] ?? 0;
        acf += left * right;
        divisor += left * left + right * right;
      }
      this.#nsdf[lag] = divisor > 0 ? (2 * acf) / divisor : 0;

      const previous = this.#nsdf[lag - 1] ?? 0;
      if (
        lag - 1 >= minLag &&
        previous >= this.#clarityThreshold &&
        previous >= (this.#nsdf[lag - 2] ?? 0) &&
        previous > (this.#nsdf[lag] ?? 0)
      ) {
        bestClarity = previous;
        bestLag = lag - 1;
        // MPM selects the first strong key maximum. Looking for the absolute
        // maximum would prefer an integer multiple of the period and produce
        // subharmonic (octave) errors.
        break;
      }
    }

    if (bestLag < 0 || bestClarity < this.#clarityThreshold) {
      return { frequencyHz: null, clarity: bestClarity, rms };
    }

    const left = this.#nsdf[bestLag - 1] ?? 0;
    const center = this.#nsdf[bestLag] ?? 0;
    const right = this.#nsdf[bestLag + 1] ?? 0;
    const denominator = left - 2 * center + right;
    const correction = denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
    const refinedLag = bestLag + Math.max(-1, Math.min(1, correction));

    return { frequencyHz: this.sampleRate / refinedLag, clarity: bestClarity, rms };
  }
}
