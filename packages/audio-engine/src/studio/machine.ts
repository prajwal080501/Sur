import type { StudioEvent, StudioState } from '@sur/shared-types';

const transitions: Readonly<
  Partial<Record<StudioState, Partial<Record<StudioEvent['type'], StudioState>>>>
> = {
  idle: { START_LISTEN: 'listening' },
  listening: { KEY_DETECTED: 'keyConfirm', CANCEL: 'idle' },
  keyConfirm: { CONFIRM_KEY: 'ready', RELISTEN: 'listening', CANCEL: 'idle' },
  ready: { PLAY: 'accompanying', RECORD: 'countIn' },
  countIn: { COUNT_IN_COMPLETE: 'recording', CANCEL: 'ready' },
  accompanying: { STOP: 'ready', RECORD: 'countIn' },
  recording: { STOP: 'review' },
  review: { KEEP: 'mix', RETAKE: 'ready' },
  mix: { EXPORT: 'exporting', BACK: 'review' },
  exporting: { EXPORT_COMPLETE: 'mix' },
  shared: { BACK: 'mix' },
};

export function transitionStudio(state: StudioState, event: StudioEvent): StudioState {
  if (state === 'exporting' && event.type === 'EXPORT_COMPLETE' && event.shared) return 'shared';
  return transitions[state]?.[event.type] ?? state;
}
