export type AccompanimentStyle = 'pad' | 'piano' | 'strum';
export type RhythmStyle = 'none' | 'keherwa' | 'dadra' | 'pop';
export type NoteOrder = 'block' | 'ascending' | 'descending';
export type PercussionVoice = 'tabla-bass' | 'tabla-treble' | 'kick' | 'snare' | 'hat';

export interface ChordStrike {
  readonly atBeats: number;
  readonly durationBeats: number;
  readonly noteOrder: NoteOrder;
  readonly spreadBeats: number;
  readonly velocity: number;
}

export interface RhythmHit {
  readonly voice: PercussionVoice;
  readonly velocity: number;
}

const CHORD_PATTERNS: Record<AccompanimentStyle, readonly ChordStrike[]> = {
  pad: [
    {
      atBeats: 0,
      durationBeats: 2,
      noteOrder: 'block',
      spreadBeats: 0,
      velocity: 0.68,
    },
  ],
  piano: [
    {
      atBeats: 0,
      durationBeats: 0.42,
      noteOrder: 'block',
      spreadBeats: 0,
      velocity: 0.86,
    },
    {
      atBeats: 0.5,
      durationBeats: 0.32,
      noteOrder: 'ascending',
      spreadBeats: 0.08,
      velocity: 0.64,
    },
    {
      atBeats: 1,
      durationBeats: 0.42,
      noteOrder: 'block',
      spreadBeats: 0,
      velocity: 0.76,
    },
    {
      atBeats: 1.5,
      durationBeats: 0.32,
      noteOrder: 'descending',
      spreadBeats: 0.08,
      velocity: 0.6,
    },
  ],
  strum: [
    {
      atBeats: 0,
      durationBeats: 0.8,
      noteOrder: 'ascending',
      spreadBeats: 0.045,
      velocity: 0.82,
    },
    {
      atBeats: 0.5,
      durationBeats: 0.45,
      noteOrder: 'descending',
      spreadBeats: 0.035,
      velocity: 0.56,
    },
    {
      atBeats: 1,
      durationBeats: 0.75,
      noteOrder: 'ascending',
      spreadBeats: 0.045,
      velocity: 0.72,
    },
    {
      atBeats: 1.5,
      durationBeats: 0.4,
      noteOrder: 'descending',
      spreadBeats: 0.035,
      velocity: 0.52,
    },
  ],
};

const KEHERWA: readonly (readonly RhythmHit[])[] = [
  [{ voice: 'tabla-bass', velocity: 0.95 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.68 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.8 }],
  [],
  [{ voice: 'tabla-bass', velocity: 0.58 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.88 }],
  [],
  [{ voice: 'tabla-bass', velocity: 0.62 }],
  [],
  [{ voice: 'tabla-bass', velocity: 0.82 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.75 }],
  [],
];

const DADRA: readonly (readonly RhythmHit[])[] = [
  [{ voice: 'tabla-bass', velocity: 0.95 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.68 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.78 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.9 }],
  [],
  [{ voice: 'tabla-bass', velocity: 0.65 }],
  [],
  [{ voice: 'tabla-treble', velocity: 0.72 }],
  [],
];

const POP: readonly (readonly RhythmHit[])[] = [
  [
    { voice: 'kick', velocity: 0.9 },
    { voice: 'hat', velocity: 0.5 },
  ],
  [{ voice: 'hat', velocity: 0.36 }],
  [
    { voice: 'snare', velocity: 0.82 },
    { voice: 'hat', velocity: 0.5 },
  ],
  [{ voice: 'hat', velocity: 0.36 }],
  [
    { voice: 'kick', velocity: 0.78 },
    { voice: 'hat', velocity: 0.5 },
  ],
  [{ voice: 'hat', velocity: 0.36 }],
  [
    { voice: 'snare', velocity: 0.86 },
    { voice: 'hat', velocity: 0.5 },
  ],
  [{ voice: 'hat', velocity: 0.4 }],
];

const RHYTHM_PATTERNS: Record<Exclude<RhythmStyle, 'none'>, readonly (readonly RhythmHit[])[]> = {
  keherwa: KEHERWA,
  dadra: DADRA,
  pop: POP,
};

export function chordPattern(style: AccompanimentStyle): readonly ChordStrike[] {
  return CHORD_PATTERNS[style];
}

export function rhythmCycleLength(style: RhythmStyle): number {
  return style === 'none' ? 0 : RHYTHM_PATTERNS[style].length;
}

export function rhythmHits(style: RhythmStyle, eighthIndex: number): readonly RhythmHit[] {
  if (!Number.isInteger(eighthIndex) || eighthIndex < 0) {
    throw new RangeError('eighthIndex must be a non-negative integer');
  }
  if (style === 'none') return [];
  const pattern = RHYTHM_PATTERNS[style];
  return pattern[eighthIndex % pattern.length] ?? [];
}
