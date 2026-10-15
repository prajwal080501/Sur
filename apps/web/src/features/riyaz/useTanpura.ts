import { SynthTanpura, type TanpuraTempo, type TanpuraTuning } from '@sur/audio-engine';
import { useCallback, useEffect, useRef, useState } from 'react';

export function useTanpura(saMidi: number) {
  const [playing, setPlaying] = useState(false);
  const [tuning, setTuning] = useState<TanpuraTuning>('Pa');
  const [tempo, setTempo] = useState<TanpuraTempo>('medium');
  const [volume, setVolume] = useState(0.35);
  const context = useRef<AudioContext | null>(null);
  const engine = useRef<SynthTanpura | null>(null);

  useEffect(() => engine.current?.setSa(saMidi), [saMidi]);
  useEffect(() => engine.current?.setTuning(tuning), [tuning]);
  useEffect(() => engine.current?.setTempo(tempo), [tempo]);
  useEffect(() => engine.current?.setVolume(volume), [volume]);

  useEffect(
    () => () => {
      engine.current?.dispose();
      void context.current?.close();
    },
    [],
  );

  const toggle = useCallback(async () => {
    if (playing) {
      engine.current?.stop();
      setPlaying(false);
      return;
    }
    if (!context.current) {
      const nextContext = new AudioContext({ latencyHint: 'interactive' });
      await nextContext.resume();
      context.current = nextContext;
      engine.current = new SynthTanpura(nextContext, saMidi);
      engine.current.setTuning(tuning);
      engine.current.setTempo(tempo);
      engine.current.setVolume(volume);
    }
    engine.current?.start();
    setPlaying(true);
  }, [playing, saMidi, tempo, tuning, volume]);

  return { playing, tuning, tempo, volume, toggle, setTuning, setTempo, setVolume };
}
