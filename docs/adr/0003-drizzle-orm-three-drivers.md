# 3. Drizzle ORM as the DB/config surface; support Postgres, SQLite, MySQL

- Status: Accepted
- Date: 2026-06-17

## Context

The user configures content types and DB access through code, and we need migrations. The ORM
choice is also the **public configuration API** of the framework: users define custom types via
this layer (ADR-0001). enbi must run across the common deployment targets.

## Decision

Use **Drizzle ORM** as the data layer and the user-facing config surface (`@enbi/db`). Support all
three Drizzle SQL dialects: **Postgres, SQLite (libSQL), and MySQL**. The user picks a driver in
their config; enbi adapts.

## Consequences

- **Good:** Drizzle is type-safe, schema-as-code (fits "configure via code"), has first-class
  migrations and multi-dialect support; users get full TS types for their custom content types.
- **Cost:** every schema/feature — especially the versioning snapshot tables (ADR-0004) — must be
  expressed portably across three dialects, or behind dialect-specific adapters. More test matrix.
- The exact `defineConfig` shape mapping custom types → tables → versioned snapshots is the central
  design problem of the `@enbi/db` sub-project.

## Alternatives considered

- **Prisma:** heavier runtime/codegen, less "schema is just TS," weaker fit for a library that
  composes into user config. Rejected.
- **Single dialect (Postgres only):** simpler, but excludes SQLite local-dev/small deploys and MySQL
  shops the user explicitly wants. Rejected.
