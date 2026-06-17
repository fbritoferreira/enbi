# 31. Unify better-auth tables into the drizzle schema via `getSchema`

- Status: Accepted
- Date: 2026-06-17

## Context

We use better-auth's **drizzle adapter**, so better-auth's tables (user/session/account/verification,
plus plugin-added fields) must be created by drizzle-kit like everything else — not by better-auth's
own (kysely) migration runner. Migrations and dev-sync need those tables in the same schema.

## Decision

`@enbi/auth` exposes `authSchema(authConfig, dialect)`: it calls better-auth `getSchema(options)` —
which returns `Record<table, { fields: Record<name, DBFieldAttribute>, order }>` — and translates each
field into a drizzle column per dialect (`string`→text/varchar, `number`→integer, `boolean`→
integer(sqlite)/boolean, `date`→text/timestamp; honoring `required`, `unique`, `references`; a text
`id` primary key per table). `@enbi/db` `buildSchema(dialect, collections, authSchema)` aggregates
content + `_revisions` + `_api_keys` + auth tables into one schema, so a single drizzle-kit pipeline
generates/migrates everything. `getSchema` is fed the same options `createAuth` builds, so plugin-added
fields (e.g. admin `role`) are included.

## Consequences

- **Good:** one schema, one migration path; auth tables track the exact better-auth config (plugins
  included); dev auto-sync and prod migrate both create auth tables → session login works everywhere.
- **Cost:** a field→drizzle mapping we maintain in `authSchema`; if better-auth adds field types we must
  extend the map. Isolated + table-tested against `getSchema`.

## Alternatives considered

- **Two-track (drizzle for content, better-auth `getMigrations` for auth):** two mechanisms + ordering
  to coordinate, and better-auth's runtime migrations target its built-in adapter, not drizzle.
  Rejected.
- **Run `@better-auth/cli generate` to emit a static drizzle schema file:** an extra codegen step and a
  generated file to keep in sync; the programmatic `getSchema` translation is in-process and testable.
  Rejected.
