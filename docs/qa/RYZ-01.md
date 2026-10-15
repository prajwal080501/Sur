# RYZ 01 Pitch meter verification

## Automated checks

- Synthetic sine waves from 80 Hz through 1000 Hz must resolve within 10 cents for at least 99 percent of voiced frames.
- Samples below the configured RMS gate must be unvoiced.
- Sargam mapping is tested across every tonic pitch class and three octaves.
- Deterministic noisy tones and 5 Hz vibrato fixtures must avoid gross pitch errors.

Run `pnpm --filter @sur/audio-engine test`.

The browser implementation now streams frames through an AudioWorklet and paints the cents needle
on a canvas animation loop. Run `node --check apps/web/public/worklets/pitch-processor.js` to verify
the standalone worklet syntax.

## Device checks

Mic-to-display latency and vocal-fixture gross pitch error require browser/device fixtures and are
not yet claimed. `/dev/latency` records an eight-click tap estimate, but human reaction time means it
does not satisfy the loopback latency acceptance criterion. Record measured loopback results here.

## Offline check

Run a production build and verify that `dist/sw.js` and `dist/manifest.webmanifest` exist and that
the generated Workbox precache manifest includes `worklets/pitch-processor.js`.
