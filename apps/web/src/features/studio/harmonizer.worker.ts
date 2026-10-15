import { RuleHarmonizer } from '@sur/audio-engine';
import type { KeyEstimate, NoteEvent } from '@sur/shared-types';

type Request =
  | { type: 'configure'; key: KeyEstimate; bpm: number }
  | { type: 'push'; note: NoteEvent }
  | { type: 'decide'; requestId: number; target: { bar: number; beat: 1 | 3; tMs: number } }
  | { type: 'hold'; on: boolean }
  | { type: 'reset' };

const harmonizer = new RuleHarmonizer();

self.onmessage = (event: MessageEvent<Request>) => {
  const request = event.data;
  switch (request.type) {
    case 'configure':
      harmonizer.reset();
      harmonizer.configure({ key: request.key, bpm: request.bpm });
      break;
    case 'push':
      harmonizer.pushNote(request.note);
      break;
    case 'decide':
      self.postMessage({
        type: 'chord',
        requestId: request.requestId,
        chord: harmonizer.decide(request.target),
      });
      break;
    case 'hold':
      harmonizer.hold(request.on);
      break;
    case 'reset':
      harmonizer.reset();
      break;
  }
};
