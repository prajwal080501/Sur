import { describe, expect, it } from 'vitest';
import { KeyDetectorEngine } from '../key/key-detector.js';
import { centsFromNearestNote, frequencyToMidi } from '../pitch/music-math.js';
import { MpmDetector } from '../pitch/mpm.js';
import { NoteSegmenter } from '../pitch/note-segmenter.js';
import { RuleHarmonizer } from './rule-harmonizer.js';

const sampleRate = 48_000;
const frameSize = 2048;
const hopSize = 1024;

function addSine(
  pcm: Float32Array,
  midi: number,
  startSecond: number,
  durationSeconds: number,
): void {
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  const start = Math.floor(startSecond * sampleRate);
  const length = Math.floor(durationSeconds * sampleRate);
  for (let index = 0; index < length; index += 1) {
    const attack = Math.min(1, index / 240);
    const release = Math.min(1, (length - index) / 480);
    pcm[start + index] =
      Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.45 * attack * release;
  }
}

describe('synthetic melody accompaniment', () => {
  it('detects C major and an F chord from sine tones', () => {
    const pcm = new Float32Array(sampleRate * 5);
    const melody = [60, 64, 67, 60, 65, 69, 65, 60];
    melody.forEach((midi, index) => addSine(pcm, midi, index * 0.5, 0.42));

    const detector = new MpmDetector(sampleRate, frameSize);
    const segmenter = new NoteSegmenter();
    const notes = [];
    const window = new Float32Array(frameSize);
    for (let offset = 0; offset + frameSize <= pcm.length; offset += hopSize) {
      window.set(pcm.subarray(offset, offset + frameSize));
      const result = detector.analyze(window);
      const midi = result.frequencyHz === null ? null : frequencyToMidi(result.frequencyHz);
      const note = segmenter.push({
        timeMs: (offset / sampleRate) * 1000,
        f0Hz: result.frequencyHz,
        midi,
        cents: midi === null ? null : centsFromNearestNote(midi),
        confidence: result.clarity,
        rms: result.rms,
      });
      if (note) notes.push(note);
    }
    const tail = segmenter.flush();
    if (tail) notes.push(tail);

    expect(notes.map((note) => Math.round(note.midi))).toEqual(melody);

    const keyDetector = new KeyDetectorEngine();
    for (const note of notes.filter((note) => note.startMs < 2_000)) keyDetector.push(note);
    const key = keyDetector.estimate();
    expect(key.tonicPc).toBe(0);
    expect(key.mode).toBe('major');

    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({ key, bpm: 120 });
    harmonizer.decide({ bar: 1, beat: 1, tMs: 0 });
    for (const note of notes) harmonizer.pushNote(note);
    const chord = harmonizer.decide({ bar: 2, beat: 3, tMs: 3_000 });
    expect(chord.symbol).toBe('F');
  });
});
