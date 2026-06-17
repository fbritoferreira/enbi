# 1. Distribute enbi as a framework, not scaffolded source

- Status: Accepted
- Date: 2026-06-17

## Context

enbi is a headless CMS. We must decide what an end-user actually installs and owns. Two poles:
a **framework** model (published packages; user repo holds only config + custom types) vs a
**scaffold** model (CLI copies the full server/admin source into the user's repo, like
create-next-app). The headline goal — "users run dev/prod with commands but don't have the whole
code, only their custom types" — points strongly at the framework model.

## Decision

enbi ships as published `@enbi/*` npm packages. An end-user repo contains only: a Drizzle config +
custom content-type definitions, and a better-auth config. The `enbi` CLI boots the server and
admin from `node_modules`. This monorepo is the framework source.

## Consequences

- **Good:** clean upgrades (bump a dep), small user repos, single source of truth for the runtime,
  matches the config-only framework model the user asked for.
- **Cost:** the runtime must be configurable purely through data/config — no "just edit the source"
  escape hatch — so the public config API (esp. `@enbi/db` `defineConfig`) must be carefully designed.
- **Hard sub-problem:** serving the Astro admin from a published package in a user's `node_modules`
  (see ADR-0002). Deferred to the admin sub-project.

## Alternatives considered

- **Scaffold (create-app):** user owns/edits everything. Rejected — contradicts "don't have the
  whole code," and makes upgrades a manual merge problem.
- **Hybrid (runtime packages + thin scaffolded shell):** viable middle ground; kept in reserve if
  the pure-framework config surface proves too constraining, but adds complexity now for no proven need.
