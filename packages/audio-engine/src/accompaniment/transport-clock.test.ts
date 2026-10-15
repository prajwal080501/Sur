import type { NoteEvent } from '@sur/shared-types';
import { describe, expect, it } from 'vitest';
import { RuleHarmonizer } from '../harmonizer/rule-harmonizer.js';
import { noteOnTransportClock } from './transport-clock.js';

function note(startMs: number, endMs: number, midi: number): NoteEvent {
  return { startMs, endMs, midi, meanCents: 0 };
}

describe('noteOnTransportClock', () => {
  it('shifts microphone AudioContext times onto the accompaniment transport', () => {
    expect(noteOnTransportClock(note(12_400, 13_200, 65), 12_000)).toEqual(note(400, 1_200, 65));
  });

  it('keeps a sung F major from changing the chord when the clocks disagree', () => {
    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({
      key: { tonicPc: 0, mode: 'major', confidence: 1 },
      bpm: 120,
    });
    harmonizer.decide({ bar: 1, beat: 1, tMs: 0 });
    harmonizer.pushNote(note(12_400, 13_200, 65));
    harmonizer.pushNote(note(12_450, 13_200, 69));
    expect(harmonizer.decide({ bar: 1, beat: 3, tMs: 1000 }).symbol).toBe('C');
  });

  it('selects F when the same melody shares the transport clock', () => {
    const harmonizer = new RuleHarmonizer();
    harmonizer.configure({
      key: { tonicPc: 0, mode: 'major', confidence: 1 },
      bpm: 120,
    });
    harmonizer.decide({ bar: 1, beat: 1, tMs: 0 });
    const originMs = 12_000;
    harmonizer.pushNote(noteOnTransportClock(note(12_400, 13_200, 65), originMs));
    harmonizer.pushNote(noteOnTransportClock(note(12_450, 13_200, 69), originMs));
    expect(harmonizer.decide({ bar: 1, beat: 3, tMs: 1000 }).symbol).toBe('F');
  });
});
