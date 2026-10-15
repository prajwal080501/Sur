import type { NoteEvent } from '@sur/shared-types';
import { describe, expect, it } from 'vitest';
import { RuleHarmonizer } from './rule-harmonizer.js';

function note(startMs: number, endMs: number, midi: number): NoteEvent {
  return { startMs, endMs, midi, meanCents: 0 };
}

describe('RuleHarmonizer', () => {
  it('starts on the tonic when there is no prior melody', () => {
    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({ key: { tonicPc: 0, mode: 'major', confidence: 1 } });
    const chord = harmonizer.decide({ bar: 1, beat: 1, tMs: 0 });
    expect(chord.roman).toBe('I');
    expect(chord.beat).toBe(1);
  });

  it('scores sustained chord tones and only emits target beat positions', () => {
    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({
      key: { tonicPc: 0, mode: 'major', confidence: 1 },
      changeMargin: 0,
      bpm: 120,
    });
    harmonizer.decide({ bar: 1, beat: 1, tMs: 0 });
    harmonizer.pushNote(note(0, 900, 65));
    harmonizer.pushNote(note(100, 900, 69));
    const chord = harmonizer.decide({ bar: 1, beat: 3, tMs: 1000 });
    expect(chord.roman).toBe('IV');
    expect([1, 3]).toContain(chord.beat);
  });

  it('holds the current chord without recomputing', () => {
    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({ key: { tonicPc: 7, mode: 'major', confidence: 1 } });
    const first = harmonizer.decide({ bar: 1, beat: 1, tMs: 0 });
    harmonizer.hold(true);
    harmonizer.pushNote(note(0, 1000, 61));
    const held = harmonizer.decide({ bar: 1, beat: 3, tMs: 1000 });
    expect(held.symbol).toBe(first.symbol);
    expect(held.source).toBe('hold');
  });

  it('retains the chord when a window has no voiced notes', () => {
    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({ key: { tonicPc: 2, mode: 'major', confidence: 1 } });
    const first = harmonizer.decide({ bar: 1, beat: 1, tMs: 0 });
    const next = harmonizer.decide({ bar: 1, beat: 3, tMs: 1500 });
    expect(next.symbol).toBe(first.symbol);
  });

  it('meets the decision-time budget on a representative phrase', () => {
    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({ key: { tonicPc: 0, mode: 'major', confidence: 1 } });
    for (let index = 0; index < 64; index += 1) {
      harmonizer.pushNote(note(index * 100, index * 100 + 90, 60 + (index % 7)));
    }
    const started = performance.now();
    for (let index = 0; index < 100; index += 1) {
      harmonizer.decide({
        bar: index + 1,
        beat: index % 2 === 0 ? 1 : 3,
        tMs: 7000 + index * 1000,
      });
    }
    expect((performance.now() - started) / 100).toBeLessThan(2);
  });
});
