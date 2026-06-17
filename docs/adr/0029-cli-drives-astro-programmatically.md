# 29. The CLI drives the Astro admin via Astro's programmatic API

- Status: Accepted
- Date: 2026-06-17

## Context

`@enbi/admin` (Astro) ships as a published package in the user's `node_modules`. `enbi dev`/`build`/
`start` must run it without the user having Astro set up themselves.

## Decision

Use Astro's **programmatic Node API** — import `astro` and call `dev({ root })` / `build({ root })`
with `root` resolved to the admin package directory (`require.resolve("@enbi/admin/package.json")` →
dirname). No shelling out to the `astro` binary. Astro is an optional/peer dependency of the CLI; the
server can run without the admin present.

## Consequences

- **Good:** one process model, typed control over the admin lifecycle, works from `node_modules`
  without a user-side Astro install; dev runs server + admin together.
- **Cost:** couples to Astro's programmatic API surface (less stable than the CLI binary). Mitigated by
  isolating the calls and a documented fallback: spawn the `astro` binary in the admin dir.

## Alternatives considered

- **Spawn the `astro` CLI binary:** simplest, but brittle PATH/resolution from a nested package and
  harder to coordinate with the server process. Kept as the fallback.
- **Pre-build admin only, never run dev:** loses live admin during `enbi dev`. Rejected.
