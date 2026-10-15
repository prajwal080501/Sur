import { WorkletPitchDetector } from '@sur/audio-engine';
import type { NoteEvent, PitchFrame } from '@sur/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { primeSharedAudioContext } from '../audio/shared-audio.js';

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
  const starting = useRef(false);
  const session = useRef<{
    context: AudioContext;
    stream: MediaStream | null;
    detector: WorkletPitchDetector;
    unsubscribeFrame: () => void;
    unsubscribeNote: () => void;
    unsubscribePcmChunk: () => void;
  } | null>(null);

  const releaseSession = useCallback((active: NonNullable<typeof session.current>) => {
    active.unsubscribeFrame();
    active.unsubscribeNote();
    active.unsubscribePcmChunk();
    active.detector.dispose();
    for (const track of active.stream?.getTracks() ?? []) track.stop();
  }, []);

  const stop = useCallback(() => {
    const active = session.current;
    session.current = null;
    starting.current = false;
    if (active) releaseSession(active);
    latestFrame.current = null;
    setFrame(null);
    setStatus('idle');
    return Promise.resolve();
  }, [releaseSession]);

  const attach = useCallback(async (source: AudioNode, stream: MediaStream | null) => {
    const context = primeSharedAudioContext();
    if (source.context !== context) {
      throw new Error('Audio source is not on the shared AudioContext');
    }
    const detector = new WorkletPitchDetector('/worklets/pitch-processor.js');
    await detector.init(context, source);
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
  }, []);

  const start = useCallback(async () => {
    primeSharedAudioContext();
    if (session.current || starting.current) return false;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode) {
      setStatus('unsupported');
      return false;
    }
    starting.current = true;
    setStatus('requesting');
    setError(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const context = primeSharedAudioContext();
      return await attach(context.createMediaStreamSource(stream), stream);
    } catch (reason) {
      for (const track of stream?.getTracks() ?? []) track.stop();
      const denied = reason instanceof DOMException && reason.name === 'NotAllowedError';
      setStatus(denied ? 'denied' : 'error');
      setError(reason instanceof Error ? reason.message : 'Unable to start microphone input');
      starting.current = false;
      return false;
    }
  }, [attach]);

  const startWithSource = useCallback(
    async (source: AudioNode) => {
      primeSharedAudioContext();
      if (session.current || starting.current) return false;
      if (!window.AudioWorkletNode) {
        setStatus('unsupported');
        return false;
      }
      starting.current = true;
      setStatus('requesting');
      setError(null);
      try {
        return await attach(source, null);
      } catch (reason) {
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Unable to start the test tone');
        starting.current = false;
        return false;
      }
    },
    [attach],
  );

  useEffect(
    () => () => {
      const active = session.current;
      session.current = null;
      starting.current = false;
      if (active) releaseSession(active);
    },
    [releaseSession],
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
    startWithSource,
    stop,
    onFrame,
    onNote,
    startRecording,
    stopRecording,
    onPcmChunk,
  };
}
