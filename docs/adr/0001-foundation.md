# ADR 0001 Monorepo foundation and dependency direction

## Status

Accepted on 14 October 2026.

## Context

Sur begins as a local-first audio application but later adds an API, asynchronous media workers, and mobile packaging. Real-time audio code has stricter performance constraints than UI and server code.

## Decision

Use pnpm workspaces with Turborepo. Domain dependencies point inward: applications may depend on shared types and the audio engine, while those packages do not import from applications. The audio engine is framework-independent and splits deterministic algorithms from browser adapters such as AudioWorklets and Web Workers.

Add backend and worker applications only with their first vertical feature. External systems such as storage, queues, authentication, and billing must sit behind narrow interfaces and have local adapters.

## Consequences

Algorithms can be tested in Node without browser setup, UI rendering cannot enter the real-time path, and later runtimes can reuse the same contracts. This adds package boundaries and build configuration but prevents a single application package from accumulating unrelated responsibilities.
