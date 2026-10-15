import { KeyDetectorEngine } from '@sur/audio-engine';
import type { KeyEstimate, NoteEvent } from '@sur/shared-types';

type Request =
  | { type: 'reset' }
  | { type: 'set-mode'; mode: 'western' | 'indian' }
  | { type: 'push'; note: NoteEvent }
  | { type: 'estimate'; requestId: number }
  | { type: 'lock'; key: KeyEstimate }
  | { type: 'unlock' };

const detector = new KeyDetectorEngine();

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  switch (request.type) {
    case 'reset':
      detector.reset();
      break;
    case 'set-mode':
      detector.setMode(request.mode);
      break;
    case 'push':
      detector.push(request.note);
      break;
    case 'estimate':
      self.postMessage({
        type: 'estimate',
        requestId: request.requestId,
        estimate: detector.estimate(),
      });
      break;
    case 'lock':
      detector.lock(request.key);
      break;
    case 'unlock':
      detector.unlock();
      break;
  }
};
