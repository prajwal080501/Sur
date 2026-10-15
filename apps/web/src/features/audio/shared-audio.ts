let shared: AudioContext | null = null;

/**
 * Create and resume the page AudioContext during the user-gesture task.
 * Call this synchronously from a click or key handler, before any await.
 * A resume() issued after an await is not a user gesture, so the context
 * stays suspended and both pitch analysis and accompaniment stay silent.
 */
export function primeSharedAudioContext(): AudioContext {
  if (!shared || shared.state === 'closed') {
    shared = new AudioContext({ latencyHint: 'interactive', sampleRate: 48_000 });
  }
  if (shared.state !== 'running') void shared.resume();
  return shared;
}
