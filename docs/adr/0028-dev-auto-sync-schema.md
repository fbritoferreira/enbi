# 28. `enbi dev` auto-syncs the schema (drizzle-kit push)

- Status: Accepted
- Date: 2026-06-17

## Context

`enbi dev` boots the content server, which queries tables that must exist. Real migrations are a
separate sub-project. Without something, `enbi dev` against a fresh database errors immediately.

## Decision

`enbi dev` runs a **schema sync** before booting: it builds the full schema (`buildSchema` from
`@enbi/db` — collections + `_revisions` + `_api_keys` + better-auth tables) and applies it to the
configured dialect via **drizzle-kit `push`** (create/update tables to match the schema). This is a
**development convenience only**; `start` does not sync, and production uses real migrations (next
sub-project). Isolated in `src/sync.ts`.

## Consequences

- **Good:** `enbi dev` works against an empty DB out of the box — fast local iteration with no manual
  migration step; uses drizzle's own push so it tracks the schema accurately across dialects.
- **Cost:** pulls `drizzle-kit` into the CLI (some overlap with the migrations sub-project); `push` can
  be lossy on destructive changes — acceptable for dev, never used in `start`/prod.

## Alternatives considered

- **Require `enbi migrate` first:** clean separation, but `dev` isn't runnable until migrations land,
  hurting the demo/iteration loop. Rejected for dev.
- **Hand-rolled `CREATE TABLE` DDL from buildSchema:** avoids drizzle-kit but reimplements push and
  drifts from drizzle's behavior. Rejected.
