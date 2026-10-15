import { westernNoteName } from '@sur/audio-engine';
import { useEffect, useRef, useState } from 'react';
import { primeSharedAudioContext } from '../../features/audio/shared-audio.js';
import { useLivePitch } from '../../features/riyaz/useLivePitch.js';
import { useAccompaniment } from '../../features/studio/useAccompaniment.js';

const F4_HZ = 349.228;
const A4_HZ = 440;

export function AccompanimentTestPage() {
  const pitch = useLivePitch();
  const accompaniment = useAccompaniment();
  const [audioState, setAudioState] = useState('not-started');
  const oscillator = useRef<OscillatorNode | null>(null);
  const midi = pitch.frame?.midi ?? null;

  useEffect(
    () => pitch.onNote((note) => accompaniment.pushNote(note)),
    [accompaniment.pushNote, pitch.onNote],
  );

  const play = () => {
    const context = primeSharedAudioContext();
    const publishState = () => setAudioState(context.state);
    context.onstatechange = publishState;
    publishState();
    void context.resume().then(publishState);
    oscillator.current?.stop();
    const tone = context.createOscillator();
    const gain = context.createGain();
    gain.gain.value = 0.22;
    tone.connect(gain);
    const startAt = context.currentTime + 0.05;
    for (let index = 0; index < 64; index += 1) {
      tone.frequency.setValueAtTime(index % 2 === 0 ? F4_HZ : A4_HZ, startAt + index * 0.35);
    }
    tone.start(startAt);
    oscillator.current = tone;
    void (async () => {
      const [inputReady, engineReady] = await Promise.all([
        pitch.startWithSource(gain),
        accompaniment.prepare({ tonicPc: 0, mode: 'major', confidence: 1 }),
      ]);
      if (!inputReady || !engineReady) return;
      accompaniment.start();
    })();
  };

  const stop = () => {
    oscillator.current?.stop();
    oscillator.current = null;
    accompaniment.stop();
    void pitch.stop();
  };

  return (
    <section className="hero" aria-labelledby="tone-test-title">
      <p className="eyebrow">Manual audio check</p>
      <h1 id="tone-test-title">Accompaniment test tone</h1>
      <p className="lede">
        Plays F and A into the pitch detector in C major. The chord should move to F, and the
        accompaniment should be audible.
      </p>
      <div className="status" aria-live="polite">
        <span>Audio context</span>
        <strong data-testid="audio-state">{audioState}</strong>
      </div>
      <div className="pitch-readout" aria-live="polite">
        <span className="pitch-note" data-testid="detected-pitch">
          {midi === null ? '—' : westernNoteName(midi)}
        </span>
        <span>Current chord</span>
        <strong data-testid="current-chord">{accompaniment.chord?.symbol ?? 'Listening…'}</strong>
      </div>
      {pitch.error && <p className="error">{pitch.error}</p>}
      {accompaniment.error && <p className="error">{accompaniment.error}</p>}
      <div className="key-actions">
        <button type="button" onClick={play} disabled={accompaniment.status === 'loading'}>
          {accompaniment.status === 'loading' ? 'Loading instruments…' : 'Play test tone'}
        </button>
        <button type="button" className="secondary" onClick={stop}>
          Stop
        </button>
      </div>
    </section>
  );
}
