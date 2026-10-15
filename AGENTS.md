<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Local development

Workspace packages export compiled `dist/` files. On a clean checkout, build `@sur/shared-types`, then `@sur/audio-engine`, `@sur/job-domain`, and `@sur/share-domain`, before `pnpm dev`. The web app is `http://127.0.0.1:5173` and the API is `http://127.0.0.1:3000`. The API requires `WORKER_CALLBACK_SECRET` of at least 32 bytes even when `SUR_ADAPTER_MODE=memory`. Development calls use `Authorization: Bearer dev-<userId>`. `pnpm verify` is the local quality gate. `pnpm test:integration` needs Docker and is separate from that gate.
