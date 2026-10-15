import { describe, expect, it } from 'vitest';
import { transitionStudio } from './machine.js';

describe('studio state machine', () => {
  it('follows the record and mix happy path', () => {
    let state = transitionStudio('idle', { type: 'START_LISTEN' });
    state = transitionStudio(state, { type: 'KEY_DETECTED' });
    state = transitionStudio(state, { type: 'CONFIRM_KEY' });
    state = transitionStudio(state, { type: 'RECORD' });
    state = transitionStudio(state, { type: 'COUNT_IN_COMPLETE' });
    state = transitionStudio(state, { type: 'STOP' });
    state = transitionStudio(state, { type: 'KEEP' });
    expect(state).toBe('mix');
  });

  it('ignores invalid transitions', () => {
    expect(transitionStudio('idle', { type: 'EXPORT' })).toBe('idle');
  });
});
