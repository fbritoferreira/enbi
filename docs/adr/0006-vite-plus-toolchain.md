# 6. Vite+ (`vp`) as the unified toolchain

- Status: Accepted
- Date: 2026-06-17

## Context

The repo was initialized with Vite+ (`vp`) — a unified toolchain over Vite, Rolldown, Vitest,
tsdown, Oxlint, Oxfmt. We must decide whether to keep it as the single toolchain for all packages.

## Decision

Use Vite+ across the monorepo: `tsdown` for library builds, Vitest for tests, `vp check`
(oxfmt + oxlint + typecheck) for quality, `vp run -r` for workspace tasks. No hand-rolled
rollup/jest configs.

## Consequences

- **Good:** one CLI, consistent config, fast Rust-based lint/format, matches the repo's existing
  setup and the project CLAUDE.md review checklist (`vp check`, `vp test`).
- **Cost:** Vite+ is young (v0.x); some features may be missing or change. We accept tracking it.
- Astro (`apps/admin`) uses its own build; it coexists with Vite+ for that app rather than being
  forced through tsdown.

## Alternatives considered

- **Replace with bespoke rollup/jest/eslint per package:** more config, slower, contradicts repo
  setup and the user's no-hand-rolled-rollup preference. Rejected.
