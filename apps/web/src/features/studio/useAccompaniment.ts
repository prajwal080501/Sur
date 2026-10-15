import type {
  AccompanimentStyle,
  BeatEvent,
  DecisionTarget,
  RhythmStyle,
  ToneAccompanimentEngine,
} from '@sur/audio-engine/tone-accompaniment';
import type { ChordEvent, KeyEstimate, NoteEvent } from '@sur/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';

interface ChordMessage {
  readonly type: 'chord';
  readonly requestId: number;
  readonly chord: ChordEvent;
}

function isChordMessage(value: unknown): value is ChordMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ChordMessage>;
  return candidate.type === 'chord' && typeof candidate.requestId === 'number';
}

export function useAccompaniment() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [style, setStyleState] = useState<AccompanimentStyle>('pad');
  const [rhythm, setRhythmState] = useState<RhythmStyle>('none');
  const [bpm, setBpmState] = useState(90);
  const [harmonyVolume, setHarmonyVolumeState] = useState(0.62);
  const [rhythmVolume, setRhythmVolumeState] = useState(0.7);
  const [held, setHeld] = useState(false);
  const [beat, setBeat] = useState<BeatEvent | null>(null);
  const [chord, setChord] = useState<ChordEvent | null>(null);
  const [countInComplete, setCountInComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const worker = useRef<Worker | null>(null);
  const engine = useRef<ToneAccompanimentEngine | null>(null);
  const requestId = useRef(0);
  const pendingAudioTimes = useRef(new Map<number, number>());
  const chordLog = useRef<ChordEvent[]>([]);
  const unsubscribers = useRef<(() => void)[]>([]);

  useEffect(() => {
    const instance = new Worker(new URL('./harmonizer.worker.ts', import.meta.url), {
      type: 'module',
    });
    instance.onmessage = (event: MessageEvent<unknown>) => {
      if (!isChordMessage(event.data)) return;
      const audioTime = pendingAudioTimes.current.get(event.data.requestId);
      pendingAudioTimes.current.delete(event.data.requestId);
      if (audioTime === undefined) return;
      engine.current?.playChord(event.data.chord, audioTime);
      chordLog.current.push(event.data.chord);
      setChord(event.data.chord);
    };
    instance.onerror = (event) => {
      setError(event.message || 'Chord engine stopped unexpectedly');
      setStatus('error');
    };
    worker.current = instance;
    return () => {
      instance.terminate();
      for (const unsubscribe of unsubscribers.current) unsubscribe();
      engine.current?.dispose();
    };
  }, []);

  const requestDecision = useCallback((target: DecisionTarget) => {
    requestId.current += 1;
    const id = requestId.current;
    pendingAudioTimes.current.set(id, target.audioTime);
    worker.current?.postMessage({
      type: 'decide',
      requestId: id,
      target: { bar: target.bar, beat: target.beat, tMs: target.tMs },
    });
  }, []);

  const prepare = useCallback(
    async (key: KeyEstimate) => {
      setStatus('loading');
      setError(null);
      try {
        chordLog.current = [];
        if (!engine.current) {
          const { ToneAccompanimentEngine: Engine } =
            await import('@sur/audio-engine/tone-accompaniment');
          engine.current = new Engine();
          unsubscribers.current = [
            engine.current.onBeat(setBeat),
            engine.current.onCountInComplete(() => setCountInComplete(true)),
            engine.current.onDecisionTarget(requestDecision),
          ];
        }
        await engine.current.load(style);
        engine.current.setTempo(bpm);
        engine.current.setRhythm(rhythm);
        engine.current.setHarmonyVolume(harmonyVolume);
        engine.current.setRhythmVolume(rhythmVolume);
        worker.current?.postMessage({ type: 'configure', key, bpm });
        setStatus('idle');
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to load accompaniment');
        setStatus('error');
        return false;
      }
    },
    [bpm, harmonyVolume, requestDecision, rhythm, rhythmVolume, style],
  );

  const start = useCallback(() => {
    setCountInComplete(false);
    engine.current?.start({ countInBars: 1 });
    setStatus('playing');
  }, []);

  const stop = useCallback(() => {
    engine.current?.stop();
    worker.current?.postMessage({ type: 'reset' });
    pendingAudioTimes.current.clear();
    setBeat(null);
    setCountInComplete(false);
    setChord(null);
    setHeld(false);
    setStatus('idle');
  }, []);

  const pushNote = useCallback((note: NoteEvent) => {
    worker.current?.postMessage({ type: 'push', note });
  }, []);

  const setTempo = useCallback((nextBpm: number) => {
    const clamped = Math.max(50, Math.min(180, Math.round(nextBpm)));
    setBpmState(clamped);
    engine.current?.setTempo(clamped);
  }, []);

  const setStyle = useCallback((nextStyle: AccompanimentStyle) => {
    setStyleState(nextStyle);
    const activeEngine = engine.current;
    if (activeEngine) {
      void activeEngine.load(nextStyle).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Unable to change instrument');
        setStatus('error');
      });
    }
  }, []);

  const setRhythm = useCallback((nextRhythm: RhythmStyle) => {
    setRhythmState(nextRhythm);
    engine.current?.setRhythm(nextRhythm);
  }, []);

  const setHarmonyVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setHarmonyVolumeState(clamped);
    engine.current?.setHarmonyVolume(clamped);
  }, []);

  const setRhythmVolume = useCallback((value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    setRhythmVolumeState(clamped);
    engine.current?.setRhythmVolume(clamped);
  }, []);

  const setHold = useCallback((on: boolean) => {
    setHeld(on);
    worker.current?.postMessage({ type: 'hold', on });
  }, []);

  const getChordLog = useCallback(() => [...chordLog.current], []);

  return {
    status,
    style,
    rhythm,
    bpm,
    harmonyVolume,
    rhythmVolume,
    held,
    beat,
    chord,
    countInComplete,
    error,
    prepare,
    start,
    stop,
    pushNote,
    setTempo,
    setStyle,
    setRhythm,
    setHarmonyVolume,
    setRhythmVolume,
    setHold,
    getChordLog,
  };
}
