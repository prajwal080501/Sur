# ACC 01 Key detection verification

## Automated checks

- Western estimates use duration-weighted Krumhansl-Schmuckler profiles across all 24 keys.
- Indian estimates weight Sa, Pa, and the phrase-final note.
- Repeated estimation from identical note events is deterministic.
- Locked keys remain unchanged until explicitly unlocked.

Run `pnpm --filter @sur/audio-engine test`.

## Evidence still required

The specification requires at least 50 labelled phrases from at least five singers, with top-one
accuracy of 80 percent and top-three accuracy of 95 percent. The algorithm is implemented, but
those accuracy criteria are not claimed until the licensed, consented fixture set exists. Worker
execution and the eight-second browser timing criterion are the next integration step.
