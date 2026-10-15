# Sur development plan

## Executive assessment

The specification is sufficient to begin implementation. It provides clear feature IDs, acceptance criteria, runtime boundaries, data contracts, security constraints, and a milestone order. The best technical path is to prove the local audio loop before building cloud features: mic input, stable pitch frames, a responsive meter, key detection, beat-scheduled harmony, and separate-track recording.

The first four-week scope is aggressive for one developer because it combines real-time DSP, cross-browser audio, recording, mastering, a public sharing backend, and server video rendering. Delivery should therefore use vertical acceptance slices and preserve the order below. Estimates in the specification remain targets until device measurements exist.

## Architecture rules

1. Applications depend on domain packages, never the reverse.
2. Real-time DSP is independent of React, performs no per-block allocation, and communicates through small typed messages.
3. Audio-rate data is rendered through canvas and refs on animation frames; it does not enter React state on every pitch frame.
4. Every cloud dependency sits behind a narrow port with a local adapter before its AWS implementation.
5. Shared schemas validate data at process and persistence boundaries. Internal algorithm code uses inferred TypeScript types.
6. Feature work is accepted against its feature ID and recorded in `docs/qa` without claiming unmeasured device targets.
7. Later features remain absent or behind interfaces. Placeholder production integrations and empty services are avoided.

## Delivery sequence

### Foundation

- Complete: pnpm and Turborepo workspace, strict TypeScript, ESLint, Prettier, Vitest, CI, shared contracts, architectural decision record, web shell.
- Complete: deterministic studio state transition core and initial MPM pitch algorithm with silence gating and musical-note utilities.
- Next: add browser adapters around the pitch core, then measure before optimizing or moving the kernel to WASM.

### W1 local pitch slice

1. AudioWorklet ring buffer and typed `PitchFrame` messages.
2. `PitchDetector` lifecycle adapter with explicit microphone permission and cleanup.
3. Canvas pitch meter and eight-second trace with Western and sargam labels.
4. Tap calibration and loopback measurement on `/dev/latency`.
5. Synthetic sweep, noise, vibrato, and fake-microphone browser fixtures.
6. PWA shell and offline cache for worklet and engine assets.

Exit only after the automated portions of RYZ-01 pass. AC2 and AC4 require the specified vocal fixtures and real-device evidence.

### W2 musical context

Implement key detection and Sa estimation in a worker, tanpura synthesis behind an accompaniment interface, and the guided range finder. Keep synthesized tones until sample licences are recorded in the asset manifest.

### W3 accompaniment and recording

Implement the rule harmoniser as a deterministic package with property tests before integrating the transport. Add lock and hold semantics, tempo changes at bar boundaries, then record raw voice and backing through separate buses. Treat alignment and crash-safe IndexedDB chunking as acceptance requirements, not polish.

### W4 finishing and share slice

Add the offline vocal chain, normalization, encoders, take report, and the smallest server path necessary for a revocable share. Server video rendering is the highest schedule risk and should use a fixture-first worker contract.

## Decisions and risks

- Clerk versus Cognito can wait until the account milestone. The API should expose an identity port so this choice does not affect resource services.
- NestJS is accepted because the specification prefers it and the planned API has enough modules and guards to justify the structure.
- Indian harmony starts with the documented major scale of Sa. Thaat-aware behaviour remains a later strategy behind the harmoniser interface.
- The JavaScript MPM implementation is a correctness baseline. Profile it on the reference Android device before choosing Rust or C for WASM; do not assume WASM is faster without measurement.
- Bluetooth timing cannot meet the wired target. Product copy, disabled monitoring, and stored output calibration are required behaviours.
- A licence manifest and CI gate must land before any recorded samples, datasets, or models enter the repository.
- The W4 share and video scope may need to move behind the local recording demo if device reliability work consumes the planned buffer.

## Quality gate

`pnpm verify` is the local and CI baseline. It checks formatting, lint rules, strict types, tests, and production builds. Browser audio and device acceptance tests will be added to this gate as their harnesses become executable.
