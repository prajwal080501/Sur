const FRAME_SIZE = 2048;
const HOP_SIZE = 512;

class SurPitchProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions ?? {};
    this.minHz = config.minHz ?? 80;
    this.maxHz = config.maxHz ?? 1000;
    this.rmsGate = 10 ** ((config.rmsGateDb ?? -55) / 20);
    this.ring = new Float32Array(FRAME_SIZE);
    this.window = new Float32Array(FRAME_SIZE);
    this.nsdf = new Float32Array(FRAME_SIZE);
    this.writeIndex = 0;
    this.available = 0;
    this.samplesSinceAnalysis = 0;
    this.message = {
      type: 'pitch-frame',
      frame: { timeMs: 0, f0Hz: null, midi: null, cents: null, confidence: 0, rms: 0 },
    };
    this.recording = false;
    this.recordBuffer = new Float32Array(Math.round(sampleRate * 2));
    this.recordIndex = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === 'record-start') {
        this.recordIndex = 0;
        this.recording = true;
      }
      if (event.data?.type === 'record-stop') {
        this.flushRecordingChunk();
        this.recording = false;
        this.port.postMessage({ type: 'record-stopped' });
      }
    };
  }

  flushRecordingChunk() {
    if (this.recordIndex === 0) return;
    this.port.postMessage({
      type: 'pcm-chunk',
      pcm: this.recordBuffer,
      length: this.recordIndex,
    });
    this.recordIndex = 0;
  }

  analyze() {
    for (let index = 0; index < FRAME_SIZE; index += 1) {
      this.window[index] = this.ring[(this.writeIndex + index) % FRAME_SIZE];
    }
    let energy = 0;
    for (let index = 0; index < FRAME_SIZE; index += 1) {
      const sample = this.window[index];
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / FRAME_SIZE);
    let frequencyHz = null;
    let clarity = 0;

    if (rms >= this.rmsGate) {
      const minLag = Math.max(2, Math.floor(sampleRate / this.maxHz));
      const maxLag = Math.min(FRAME_SIZE - 2, Math.ceil(sampleRate / this.minHz) + 1);
      let bestLag = -1;
      for (let lag = minLag - 1; lag <= maxLag; lag += 1) {
        let acf = 0;
        let divisor = 0;
        const overlap = FRAME_SIZE - lag;
        for (let index = 0; index < overlap; index += 1) {
          const left = this.window[index];
          const right = this.window[index + lag];
          acf += left * right;
          divisor += left * left + right * right;
        }
        this.nsdf[lag] = divisor > 0 ? (2 * acf) / divisor : 0;
        const previous = this.nsdf[lag - 1];
        if (
          lag - 1 >= minLag &&
          previous >= 0.9 &&
          previous >= this.nsdf[lag - 2] &&
          previous > this.nsdf[lag]
        ) {
          bestLag = lag - 1;
          clarity = previous;
          break;
        }
      }
      if (bestLag >= 0) {
        const left = this.nsdf[bestLag - 1];
        const center = this.nsdf[bestLag];
        const right = this.nsdf[bestLag + 1];
        const denominator = left - 2 * center + right;
        const correction = denominator === 0 ? 0 : (0.5 * (left - right)) / denominator;
        frequencyHz = sampleRate / (bestLag + Math.max(-1, Math.min(1, correction)));
      }
    }

    const midi = frequencyHz === null ? null : 69 + 12 * Math.log2(frequencyHz / 440);
    const frame = this.message.frame;
    frame.timeMs = (currentFrame / sampleRate) * 1000;
    frame.f0Hz = frequencyHz;
    frame.midi = midi;
    frame.cents = midi === null ? null : (midi - Math.round(midi)) * 100;
    frame.confidence = clarity;
    frame.rms = rms;
    this.port.postMessage(this.message);
  }

  process(inputs, outputs) {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (output) output.fill(0);
    if (!input) return true;
    for (let index = 0; index < input.length; index += 1) {
      const sample = input[index];
      this.ring[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % FRAME_SIZE;
      this.available = Math.min(FRAME_SIZE, this.available + 1);
      this.samplesSinceAnalysis += 1;
      if (this.recording) {
        this.recordBuffer[this.recordIndex] = sample;
        this.recordIndex += 1;
        if (this.recordIndex === this.recordBuffer.length) this.flushRecordingChunk();
      }
    }
    if (this.available === FRAME_SIZE && this.samplesSinceAnalysis >= HOP_SIZE) {
      this.samplesSinceAnalysis = 0;
      this.analyze();
    }
    return true;
  }
}

registerProcessor('sur-pitch-processor', SurPitchProcessor);
