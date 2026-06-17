# 30. Versioned migration files with a lightweight apply runner

- Status: Accepted
- Date: 2026-06-17

## Context

`enbi dev` auto-syncs via drizzle-kit push (ADR-0028), which has no history and is unsafe for
production. Production needs reproducible, reviewable migrations. Options: versioned SQL files
(generate + apply) vs push-to-prod vs both.

## Decision

Ship **versioned migration files**. `enbi generate` diffs the assembled schema against the previous
snapshot (drizzle-kit's programmatic `generate*DrizzleJson` + `generate*Migration`) and writes
`NNNN_<name>.sql` + `meta/NNNN_snapshot.json` to the user repo's `./drizzle/`. `enbi migrate` applies
pending files with a **lightweight, dialect-portable runner**: a `_enbi_migrations(name, applied_at)`
table tracks what ran; each unapplied `.sql` is split on drizzle's `--> statement-breakpoint` and
executed in order. `dev` keeps push auto-sync for fast iteration.

## Consequences

- **Good:** reviewable, committed migration history; safe forward-only production apply; idempotent
  re-runs; the apply runner is simple and fully testable (no coupling to drizzle-kit's journal
  internals); dev stays fast via push.
- **Cost:** two code paths (dev push vs prod files) — acceptable and explicitly separated; forward-only
  (no down migrations) for v1; our own tracking table rather than drizzle's `__drizzle_migrations`.

## Alternatives considered

- **Push to prod (no files):** simplest but no history/rollback, risky for real data. Rejected for prod.
- **drizzle-orm's `migrate()` + drizzle-kit journal:** reuses drizzle's runner but requires reproducing
  drizzle-kit's exact journal/snapshot folder format from our runtime-assembled schema; more coupling
  and harder to test. Rejected in favor of the small custom runner.
