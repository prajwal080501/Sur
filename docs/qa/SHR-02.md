# SHR 02 Vertical-video verification

The first server-rendering slice is a deterministic Python worker contract around ffmpeg. It accepts
only a validated local audio input and bounded render parameters, then creates a 1080×1920 MP4 with
H.264 video, AAC audio, a waveform, title card, optional timed chord cards, and a mandatory
"Made with Sur" card for free-tier renders. Text is rasterized into temporary image assets, so it is
never interpolated into a shell or ffmpeg expression.

`pnpm test:workers` generates a synthetic 48 kHz audio fixture, renders one second of output, and
uses ffprobe to assert the video dimensions and both codecs. Unit coverage also rejects invalid
duration and chord ordering and returns `STEMS_NOT_SHAREABLE` before reading media. CI runs Ruff and
this render test after installing ffmpeg.

The authenticated API accepts the same bounded render shape at `POST /api/v1/jobs` and exposes
owner-scoped status through `GET /api/v1/jobs/:id`. Its domain writes through one submission port
whose production contract is an atomic job-plus-outbox commit, avoiding a persisted queued job with
no corresponding queue message. Domain and HTTP tests cover ownership, validation, cloud readiness,
and the third-party-stem policy.

Cloud mode implements that contract with a MongoDB transaction using snapshot reads and majority
writes. The transaction inserts a deterministic outbox record alongside the job, and startup creates
the job/outbox query indexes. A single-claim dispatcher uses expiring locks, bounded exponential
backoff, stable event IDs, and the modular AWS SQS client. Tests verify the shared transaction
session, guaranteed cleanup, publish acknowledgement, retry scheduling, idle behavior, HTTPS queue
enforcement, and the serialized SQS envelope.

The 60-second p50 render-time target, Instagram and YouTube upload checks, user photo/background
composition, a deployed SQS/worker integration test, exhausted-attempt alerting, S3 worker staging,
poster generation, and device-visible end-to-end flow remain pending and are not claimed.
