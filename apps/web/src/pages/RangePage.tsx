import { RangeFinder, westernNoteName, type VocalRangeResult } from '@sur/audio-engine';
import { useEffect, useRef, useState } from 'react';
import { useLivePitch } from '../features/riyaz/useLivePitch.js';

export function RangePage() {
  const pitch = useLivePitch();
  const finder = useRef(new RangeFinder());
  const [phase, setPhase] = useState<'idle' | 'lowest' | 'highest' | 'complete'>('idle');
  const [lowestMidi, setLowestMidi] = useState<number | null>(null);
  const [result, setResult] = useState<VocalRangeResult | null>(null);

  useEffect(() => {
    if ((phase !== 'lowest' && phase !== 'highest') || !pitch.frame) return;
    const registered = finder.current.push(pitch.frame);
    if (registered === null) return;
    if (phase === 'lowest') {
      setLowestMidi(registered);
      finder.current.setPhase('highest');
      setPhase('highest');
      return;
    }
    const completed = finder.current.result();
    if (!completed) return;
    setResult(completed);
    localStorage.setItem('sur.vocalRange', JSON.stringify(completed));
    setPhase('complete');
    void pitch.stop();
  }, [phase, pitch.frame, pitch.stop]);

  const start = async () => {
    finder.current.reset();
    setLowestMidi(null);
    setResult(null);
    if (await pitch.start()) setPhase('lowest');
  };

  const cancel = async () => {
    await pitch.stop();
    finder.current.reset();
    setPhase('idle');
  };

  return (
    <section className="content" aria-labelledby="range-title">
      <p className="eyebrow">Riyaz</p>
      <h1 id="range-title">Find your comfortable range</h1>
      <p>
        {phase === 'lowest'
          ? 'Sing and hold your lowest comfortable note.'
          : phase === 'highest'
            ? 'Now sing and hold your highest comfortable note.'
            : 'Two steady notes are enough. Sur requires 300 ms of stable pitch for each endpoint.'}
      </p>
      {(phase === 'lowest' || phase === 'highest') && (
        <div className="range-live" aria-live="polite">
          <span>Current pitch</span>
          <strong>
            {pitch.frame?.midi === null ? '—' : westernNoteName(pitch.frame?.midi ?? 60)}
          </strong>
          {lowestMidi !== null && <span>Lowest registered: {westernNoteName(lowestMidi)}</span>}
        </div>
      )}
      {result && (
        <div className="range-result" aria-live="polite">
          <span>{westernNoteName(result.lowestMidi)}</span>
          <div className="range-line" />
          <span>{westernNoteName(result.highestMidi)}</span>
          <strong>{result.rangeSemitones} semitones</strong>
          <p>Suggested Sa: {westernNoteName(result.suggestedSaMidi)}</p>
        </div>
      )}
      {phase === 'idle' || phase === 'complete' ? (
        <button type="button" onClick={() => void start()}>
          {phase === 'complete' ? 'Test again' : 'Start range test'}
        </button>
      ) : (
        <button type="button" className="secondary" onClick={() => void cancel()}>
          Cancel
        </button>
      )}
      {pitch.error && <p className="error">{pitch.error}</p>}
    </section>
  );
}
