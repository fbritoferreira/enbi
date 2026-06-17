# 11. The CLI manages its own `bin`/`exports` instead of `vp pack` auto-exports

- Status: Accepted
- Date: 2026-06-17

## Context

`vp pack` offers `pack.exports: true`, which auto-generates the package's `exports` map (and
related fields) from the build entries. Every other `@enbi/*` library uses it happily. For
`@enbi/cli`, with two entries (`src/index.ts` + `bin/enbi.ts`), the auto-generation rewrote the
`bin` field to `{ "cli": "./dist/bin/enbi.mjs" }` — deriving the bin name from the unscoped package
name (`cli`) — and replaced the `.` export. We need the binary to be `enbi`, not `cli`.

## Decision

`@enbi/cli` sets `pack: { exports: false }` and hand-maintains its `package.json`:

```json
"bin": { "enbi": "./dist/bin/enbi.mjs" },
"exports": { ".": "./dist/src/index.mjs", "./package.json": "./package.json" }
```

All other packages keep `pack.exports: true`.

## Consequences

- **Good:** the published binary is `enbi` regardless of the package's unscoped name; build no longer
  silently rewrites `bin`/`exports`.
- **Cost:** if the CLI's entry layout changes, the `exports`/`bin` paths must be updated by hand
  (they won't auto-track). The dist layout is nested (`dist/bin/enbi.mjs`, `dist/src/index.mjs`)
  because tsdown preserves the entries' directory structure.

## Alternatives considered

- **Keep `exports: true` and re-fix `bin` after each build:** the auto-rewrite would clobber it on
  every build. Rejected.
- **Rename the package to `@enbi/enbi` so the unscoped name is `enbi`:** confusing package name just
  to satisfy a tool default. Rejected.
- **Collapse to a single entry:** loses the clean library (`getVersion`) vs binary split. Rejected.
