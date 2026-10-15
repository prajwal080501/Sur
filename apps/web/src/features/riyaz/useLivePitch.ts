import { WorkletPitchDetector } from '@sur/audio-engine';
import type { NoteEvent, PitchFrame } from '@sur/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';

type PitchStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unsupported' | 'error';

export function useLivePitch() {
  const [frame, setFrame] = useState<PitchFrame | null>(null);
  const [status, setStatus] = useState<PitchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const latestFrame = useRef<PitchFrame | null>(null);
  const lastUiUpdateMs = useRef(0);
  const frameSubscribers = useRef(new Set<(frame: PitchFrame) => void>());
  const noteSubscribers = useRef(new Set<(note: NoteEvent) => void>());
  const pcmChunkSubscribers = useRef(new Set<(pcm: Float32Array) => void>());
  const session = useRef<{
    context: AudioContext;
    stream: MediaStream;
    detector: WorkletPitchDetector;
    unsubscribeFrame: () => void;
    unsubscribeNote: () => void;
    unsubscribePcmChunk: () => void;
  } | null>(null);

  const stop = useCallback(async () => {
    const active = session.current;
    session.current = null;
    if (active) {
      active.unsubscribeFrame();
      active.unsubscribeNote();
      active.unsubscribePcmChunk();
      active.detector.dispose();
      for (const track of active.stream.getTracks()) track.stop();
      await active.context.close();
    }
    latestFrame.current = null;
    setFrame(null);
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (session.current || status === 'requesting') return false;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      setStatus('unsupported');
      return false;
    }
    setStatus('requesting');
    setError(null);
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48_000 });
      await context.resume();
      const detector = new WorkletPitchDetector('/worklets/pitch-processor.js');
      await detector.init(context, context.createMediaStreamSource(stream));
      const unsubscribeFrame = detector.onFrame((nextFrame) => {
        latestFrame.current = nextFrame;
        for (const subscriber of frameSubscribers.current) subscriber(nextFrame);
        const now = performance.now();
        if (now - lastUiUpdateMs.current >= 80) {
          lastUiUpdateMs.current = now;
          setFrame(nextFrame);
        }
      });
      const unsubscribeNote = detector.onNote((note) => {
        for (const subscriber of noteSubscribers.current) subscriber(note);
      });
      const unsubscribePcmChunk = detector.onPcmChunk((pcm) => {
        for (const subscriber of pcmChunkSubscribers.current) subscriber(pcm);
      });
      session.current = {
        context,
        stream,
        detector,
        unsubscribeFrame,
        unsubscribeNote,
        unsubscribePcmChunk,
      };
      setStatus('listening');
      return true;
    } catch (reason) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      if (context) await context.close();
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError';
      setStatus(denied ? 'denied' : 'error');
      setError(reason instanceof Error ? reason.message : 'Unable to start microphone input');
      return false;
    }
  }, [status]);

  useEffect(
    () => () => {
      const active = session.current;
      session.current = null;
      if (!active) return;
      active.unsubscribeFrame();
      active.unsubscribeNote();
      active.unsubscribePcmChunk();
      active.detector.dispose();
      for (const track of active.stream.getTracks()) track.stop();
      void active.context.close();
    },
    [],
  );
  const getLatestFrame = useCallback(() => latestFrame.current, []);
  const onNote = useCallback((callback: (note: NoteEvent) => void) => {
    noteSubscribers.current.add(callback);
    return () => {
      noteSubscribers.current.delete(callback);
    };
  }, []);
  const onFrame = useCallback((callback: (frame: PitchFrame) => void) => {
    frameSubscribers.current.add(callback);
    return () => {
      frameSubscribers.current.delete(callback);
    };
  }, []);
  const startRecording = useCallback(() => {
    if (!session.current) throw new Error('Microphone session is not active');
    session.current.detector.startRecording();
  }, []);
  const onPcmChunk = useCallback((callback: (pcm: Float32Array) => void) => {
    pcmChunkSubscribers.current.add(callback);
    return () => {
      pcmChunkSubscribers.current.delete(callback);
    };
  }, []);
  const stopRecording = useCallback(async () => {
    if (!session.current) throw new Error('Microphone session is not active');
    const active = session.current;
    const voice = await active.detector.stopRecording();
    return { voice, sampleRate: active.context.sampleRate };
  }, []);
  return {
    frame,
    getLatestFrame,
    status,
    error,
    start,
    stop,
    onFrame,
    onNote,
    startRecording,
    stopRecording,
    onPcmChunk,
  };
}
