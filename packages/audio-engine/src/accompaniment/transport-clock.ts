import type { NoteEvent } from '@sur/shared-types';

/**
 * Pitch notes are stamped with the microphone AudioContext clock. Chord
 * decisions use milliseconds since the accompaniment transport started.
 * Those clocks are not the same timeline.
 */
export function noteOnTransportClock(note: NoteEvent, originMs: number): NoteEvent {
  if (!Number.isFinite(originMs)) throw new RangeError('originMs must be finite');
  return {
    ...note,
    startMs: note.startMs - originMs,
    endMs: note.endMs - originMs,
  };
}
