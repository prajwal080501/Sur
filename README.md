# Sur

Sur is a browser-first music studio that detects a singer's pitch and key, generates beat-aligned accompaniment, and records voice and backing as separate tracks.

The product and technical requirements live in [docs/SPEC.md](docs/SPEC.md). Development follows the milestone order in section 13, beginning with the local audio path so latency, privacy, and offline behaviour remain first-class constraints.

## Prerequisites

- Node.js 20.19 or newer
- pnpm 11.5.2
- Python 3.11 and ffmpeg for media-worker verification

## Development

```bash
pnpm install
pnpm dev
```

Copy the relevant `.env.example` file before running an application. The API defaults to isolated
in-memory adapters for development; `SUR_ADAPTER_MODE=cloud` requires MongoDB, AWS, and HTTPS media
settings and fails fast when any are absent. Production authentication uses an HTTPS JWKS endpoint
with exact issuer and audience validation; development bearer tokens are rejected outside
development and test environments.

Run the complete local quality gate with `pnpm verify`.

Run `pnpm test:integration` when Docker is available to validate MongoDB transactions and the
S3/SQS adapters against disposable MongoDB 8.0 and LocalStack services. This slower gate downloads
its pinned test infrastructure on first use and is also enforced in CI.

For the media worker, install `workers/ml[dev]` into a Python environment. Run
`ruff check workers/ml && pnpm test:workers` for local verification, or configure
`workers/ml/.env.example` and start the SQS consumer with `sur-worker`.

Current implementation progress and unverified acceptance criteria are tracked in
[docs/STATUS.md](docs/STATUS.md).

## Workspace layout

- `apps/web` — React PWA and development audio tools
- `apps/api` — NestJS API adapters and HTTP composition root
- `packages/shared-types` — shared validated domain and API contracts
- `packages/audio-engine` — framework-independent pitch, key, and harmony logic
- `packages/job-domain` — queue-agnostic media job submission and ownership rules
- `packages/share-domain` — storage-agnostic share publication and revocation rules
- `workers/ml` — Python vertical-video renderer and idempotent SQS/S3 worker runtime
- `docs/adr` — architectural decisions
- `docs/qa` — acceptance-criteria verification guides

Mobile workspaces will be added at the milestone where their first executable feature is
introduced. Empty speculative services are intentionally avoided.
