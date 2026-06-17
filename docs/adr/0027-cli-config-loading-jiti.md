# 27. Load `enbi.config.ts` at runtime with jiti

- Status: Accepted
- Date: 2026-06-17

## Context

The CLI must read the user's `enbi.config.ts` — a TypeScript file in their repo — at runtime, with no
build step on the user's side. Options: jiti (runtime TS/ESM loader), tsx/esbuild, or requiring users
to precompile config to JS.

## Decision

Load the config with **jiti** (already in the dependency tree). `loadConfig(cwd, configPath?)` resolves
`enbi.config.ts` (or `--config`), imports it via jiti, and validates the default export is an
`EnbiConfig` (db/auth/roles/collections present), throwing `EnbiError("config", …)` otherwise.

## Consequences

- **Good:** users write a normal TS config with full types (`defineEnbiConfig`) and run `enbi dev`
  directly — no compile step; jiti handles TS + ESM + caching; matches how Vite+ loads `vite.config.ts`.
- **Cost:** jiti is a runtime dependency of the CLI; very large configs pay a small load cost (cached).

## Alternatives considered

- **tsx/esbuild loader:** heavier; esbuild's native binary conflicts with our no-build-scripts posture.
  Rejected.
- **Require precompiled JS config:** worse DX, defeats the TS config surface. Rejected.
