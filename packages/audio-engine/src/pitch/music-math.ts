const A4_HZ = 440;
const A4_MIDI = 69;

export const WESTERN_NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

export const SARGAM_NAMES = [
  'Sa',
  'komal Re',
  'Re',
  'komal Ga',
  'Ga',
  'Ma',
  'tivra Ma',
  'Pa',
  'komal Dha',
  'Dha',
  'komal Ni',
  'Ni',
] as const;

export function frequencyToMidi(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    throw new RangeError('frequencyHz must be a positive finite number');
  }
  return A4_MIDI + 12 * Math.log2(frequencyHz / A4_HZ);
}

export function midiToFrequency(midi: number): number {
  if (!Number.isFinite(midi)) throw new RangeError('midi must be finite');
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

export function centsFromNearestNote(midi: number): number {
  return (midi - Math.round(midi)) * 100;
}

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function westernNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = WESTERN_NOTE_NAMES[pitchClass(rounded)];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function sargamName(midi: number, saPitchClass: number): string {
  if (!Number.isInteger(saPitchClass) || saPitchClass < 0 || saPitchClass > 11) {
    throw new RangeError('saPitchClass must be an integer from 0 to 11');
  }
  const relative = (pitchClass(midi) - saPitchClass + 12) % 12;
  return SARGAM_NAMES[relative] ?? SARGAM_NAMES[0];
}
