import type { KeyEstimate, NoteEvent } from '@sur/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';

export type KeyMode = 'western' | 'indian';
export type KeyResult = KeyEstimate & { alternatives: KeyEstimate[] };

interface WorkerEstimateMessage {
  readonly type: 'estimate';
  readonly requestId: number;
  readonly estimate: KeyResult;
}

function isEstimateMessage(value: unknown): value is WorkerEstimateMessage {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<WorkerEstimateMessage>;
  return candidate.type === 'estimate' && typeof candidate.requestId === 'number';
}

export function useKeyDetection() {
  const [estimate, setEstimate] = useState<KeyResult | null>(null);
  const [needsMoreAudio, setNeedsMoreAudio] = useState(false);
  const worker = useRef<Worker | null>(null);
  const firstNoteMs = useRef<number | null>(null);
  const requestId = useRef(0);
  const latestHandledRequest = useRef(0);

  useEffect(() => {
    const instance = new Worker(new URL('./key-detector.worker.ts', import.meta.url), {
      type: 'module',
    });
    instance.onmessage = (event: MessageEvent<unknown>) => {
      if (!isEstimateMessage(event.data) || event.data.requestId < latestHandledRequest.current)
        return;
      latestHandledRequest.current = event.data.requestId;
      if (event.data.estimate.confidence < 0.5) {
        setNeedsMoreAudio(true);
        return;
      }
      setNeedsMoreAudio(false);
      setEstimate(event.data.estimate);
    };
    worker.current = instance;
    return () => instance.terminate();
  }, []);

  const begin = useCallback((mode: KeyMode) => {
    firstNoteMs.current = null;
    setEstimate(null);
    setNeedsMoreAudio(false);
    worker.current?.postMessage({ type: 'reset' });
    worker.current?.postMessage({ type: 'set-mode', mode });
  }, []);

  const push = useCallback((note: NoteEvent) => {
    firstNoteMs.current ??= note.startMs;
    worker.current?.postMessage({ type: 'push', note });
    if (note.endMs - firstNoteMs.current < 4000) return;
    requestId.current += 1;
    worker.current?.postMessage({ type: 'estimate', requestId: requestId.current });
  }, []);

  const reset = useCallback(() => {
    firstNoteMs.current = null;
    setEstimate(null);
    setNeedsMoreAudio(false);
    worker.current?.postMessage({ type: 'reset' });
  }, []);

  const lock = useCallback((key: KeyEstimate) => {
    worker.current?.postMessage({ type: 'lock', key });
  }, []);

  return { estimate, needsMoreAudio, begin, push, reset, lock };
}
