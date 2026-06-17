# 18. A single `enbi.config.ts` defines db, auth, roles, and collections

- Status: Accepted
- Date: 2026-06-17

## Context

The framework boots from the user's repo (ADR-0001). It needs the DB connection, auth setup, roles,
and the collection set. These could be separate files the CLI discovers, or one config object.

## Decision

One `enbi.config.ts` exporting `defineEnbiConfig({ db, auth, roles, collections })`. `@enbi/db`
owns `createDb(config.db)` and shares the single Drizzle instance with `@enbi/auth` and
`@enbi/core`, so auth tables and content tables live in one connection/migration set.

## Consequences

- **Good:** one obvious place to configure a project; one DB connection shared across subsystems
  (auth + content + revisions in one migration story); easy for the CLI to load.
- **Cost:** the config file can grow large for big projects (mitigable by importing collection
  modules into it); a single connection means one dialect per deployment (acceptable).

## Alternatives considered

- **Separate db/auth/collections files auto-discovered:** more magic, harder to trace, multiple
  connection bootstrapping paths. Rejected.
- **User constructs the Drizzle instance themselves and passes it in:** more flexible but pushes
  dialect/driver wiring onto every user and complicates better-auth adapter setup. Rejected for the
  default path (could be an advanced escape hatch later).
