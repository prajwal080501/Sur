# Development status

Updated 15 October 2026.

## Completed foundations

- Monorepo, strict TypeScript, linting, formatting, tests, production builds, and CI.
- Installable offline PWA shell with the pitch worklet in the precache.
- MPM pitch baseline, Western and sargam naming, canvas meter, and eight-second trace.
- Stable note segmentation and worker-backed Western key and Indian Sa estimation.
- Listen, confirm, alternatives, semitone nudge, and key-lock Studio flow.
- Tap-latency estimate, with loopback measurement still explicitly unclaimed.
- Guided range finder with local result persistence and suggested Sa.
- Synthesized development tanpura with Pa, Ma, and Ni tuning.
- Rule harmoniser with the specification transition matrix, hysteresis, Hold, and beat-constrained events.
- Worker-backed live accompaniment with lazy Tone.js loading, ahead-of-beat chord scheduling, tempo,
  beat display, Hold, and end-to-end Chrome coverage. Pad, Piano, and Strum use distinct deterministic
  sampler patterns; Keherwa and Dadra tabla patterns plus pop drums run on an independent rhythm bus.
- Live harmony/rhythm level controls, next-chord instrument switching, audible count-in, and matching
  deterministic offline arrangement renders for recorded backing tracks.
- A sample provenance manifest and verification gate that enforces licences, declared files, exact
  byte counts, and the 15 MB free-pack limit before recorded assets can enter the repository.
- Deterministic track alignment and 16-bit or 24-bit WAV encoding foundations.
- Crash-safe chunked voice capture, deterministic backing re-render, local take persistence, and
  separate voice/backing WAV downloads.
- Offline vocal presets, worker-backed −14 LUFS normalization, and mixed stereo WAV download.
- Worker-backed mono and stereo 24-bit WAV encoding, including a non-blocking export state.
- Worker-backed normalized MP3 export from 128–320 kbps with the codec isolated from the interactive
  bundle and recorded in the third-party licence manifest.
- On-device post-take pitch accuracy, range, stability, and weakest-note reporting persisted with the
  take.
- Audio-clock count-in completion with an idempotent bounded fallback when browser draw scheduling is
  throttled.
- Storage-independent share creation, resolution, expiry, and revocation rules with atomic slug
  reservation, rollback, ownership checks, and third-party-stem blocking.
- Executable NestJS share routes under `/api/v1`, shared Zod boundary validation, a consistent error
  envelope, and a development-only bearer-token identity adapter.
- A deterministic ffmpeg vertical-video worker foundation with rasterized text cards, waveform,
  timed chords, mandatory free-tier watermarking, and H.264/AAC ffprobe verification.
- Shared render-job schemas plus authenticated create/status API routes backed by an atomic
  submission/outbox port, with ownership, cloud-readiness, and stem-policy enforcement.
- A schema-validated, lazy-loaded public share route with audio/video playback, performance facts,
  chord timing, and explicit revoked/expired-link handling.
- Opt-in cloud adapters for MongoDB share/job persistence, atomic job outbox creation, a cloud-ready
  take projection, and S3-to-CDN publication/revocation with fail-fast configuration.
- An expiring-lock outbox dispatcher with bounded retries and stable event envelopes delivered
  through the modular AWS SQS client.
- Provider-neutral production JWT authentication with cached HTTPS JWKS discovery, strict
  issuer/audience/expiry/subject checks, and an asymmetric-algorithm allowlist.
- An idempotent SQS render consumer with strict envelope validation, S3 staging, visibility
  heartbeats, deterministic output keys, signed status callbacks, redrive-safe acknowledgement,
  and short-lived private output URLs.
- Disposable integration coverage for MongoDB replica-set transactions and rollback, S3 media
  publication/revocation, and SQS event delivery, using pinned test infrastructure.

## Current quality evidence

- 52 audio-engine tests, three web codec tests, eight share-domain tests, five job-domain tests,
  twenty-seven API/adapter tests, three disposable cloud integration tests, thirteen worker tests,
  and four Playwright end-to-end flows pass.
- `pnpm verify` passes formatting, lint, strict type checks, tests, and production builds.
- `pnpm test:loudness` independently verifies the normalized WAV at −14.05 LUFS and −10.68 dBTP
  through ffmpeg `loudnorm`.
- `pnpm test:workers` renders and probes a synthetic 1080×1920 H.264/AAC MP4; invalid bounds and
  third-party-stem policy checks also pass.
- The initial application bundle remains below the 250 KB gzip target.
- Device latency, vocal-fixture accuracy, acoustic-sample continuity/listening tests, and ground-truth
  chord agreement remain pending and are not claimed. Current accompaniment timbres are original
  procedural sample buffers, not recordings of acoustic piano, guitar, tabla, or drums.

## Active slice

Validate accompaniment timing and continuity with long offline/device fixtures, then replace or
augment procedural timbres with owned or CC0 acoustic recordings under the manifest gate. The cloud
take-upload/register boundary and render-to-share vertical slice remain the next backend work.
