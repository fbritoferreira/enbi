# enbi — Migrations (`enbi generate` + `enbi migrate`) Design

Date: 2026-06-17
Status: Approved (build)

## Context

`enbi dev` auto-syncs the schema (drizzle-kit push, ADR-0028) but only enbi's own tables, and there
is no production table-creation. This sub-project adds **versioned migrations** and brings
**better-auth's tables** into the same pipeline, so production setup and session login work.

### Decisions (brainstorm)

- **Strategy:** versioned migration files — `enbi generate` writes them (committed), `enbi migrate` applies them.
- **Auth tables:** **unified** into the drizzle schema (translate better-auth `getSchema()` → drizzle tables) so one pipeline migrates everything (ADR-0031).
- **Commands:** `enbi generate` + `enbi migrate` (replaces the stub).
- `enbi auth setup <provider>` is a **separate** future sub-project (not here).

## Unified schema

`@enbi/auth` gains `authSchema(authConfig, dialect)`:

- call better-auth `getSchema(buildAuthOptions(authConfig))` → `Record<table, { fields, order }>`;
- map each field's `DBFieldAttribute` to a drizzle column per dialect — `string`→text/varchar,
  `number`→integer, `boolean`→integer(sqlite)/boolean, `date`→text/timestamp; honor `required`,
  `unique`, `references`; every table gets a text `id` primary key;
- return `Record<tableName, drizzleTable>`.

`@enbi/db` `buildSchema(dialect, collections, authSchema)` already accepts the auth schema and
aggregates content tables + `_revisions` + `_api_keys` + auth tables into one object. `assembleSchema`
(CLI) = `buildSchema(dialect, config.collections, authSchema(config.auth, dialect))`.

`enbi dev`'s sync now also includes the auth tables (via the unified schema) → session login works in dev.

## `enbi generate`

1. `assembleSchema(config, dialect)` → full schema.
2. `generate{Drizzle,SQLite,MySQL}DrizzleJson(schema)` → current snapshot.
3. Load previous snapshot (`<dir>/meta/<n>.json`, newest) or empty; `generate{,SQLite,MySQL}Migration(prev, cur)` → SQL statements.
4. Empty → log "no schema changes". Else write `<dir>/NNNN_<name>.sql` (statements joined with
   `--> statement-breakpoint`) + `<dir>/meta/NNNN_snapshot.json`. `<dir>` = `./drizzle` (override via `--dir`).

## `enbi migrate`

Lightweight, dialect-portable runner (own tracking table — avoids coupling to drizzle-kit's journal):

1. Connect via `createDb(config.db)`.
2. Ensure `_enbi_migrations(name text primary key, applied_at text)`.
3. List `<dir>/*.sql` sorted; for each name not in `_enbi_migrations`, split on `--> statement-breakpoint`,
   execute each statement, insert the tracking row. Idempotent; re-running applies only new files.

## Modules

- `@enbi/auth/src/schema.ts` — `authSchema(authConfig, dialect)` + `buildAuthOptions(authConfig)` (shared with `createAuth`).
- `tools/cli/src/migrate/{schema,generate,apply}.ts`.
- `tools/cli/src/commands/{generate,migrate}.ts` (migrate replaces the stub).
- `index.ts` registers the two cac commands; `dev` sync uses the unified schema.

## Error handling

Typed `EnbiError`: missing config (`config`), unknown dialect (`config`), SQL execution failures wrapped
with the offending file name. `generate` with no changes is a clean no-op (not an error).

## Testing (sqlite `:memory:` + tmp dir)

- `authSchema`: yields `user`/`session`/`account`/`verification` drizzle tables with id + expected columns.
- `assembleSchema`: includes content + `_revisions` + `_api_keys` + auth tables.
- `generate`: first run writes a `.sql` creating all tables + a snapshot; second run (no change) writes nothing.
- `migrate`: apply generated files → tables exist (`sqlite_master`); re-run is a no-op (`_enbi_migrations` tracks); a second generated migration applies incrementally.
- Integration: generate → migrate → `createServer` → content CRUD **and** better-auth email/password signup succeed against the migrated DB.

## Out of scope

- `enbi auth setup <provider>` (next sub-project).
- Rollback/down migrations (forward-only for v1).
- Migration squashing / editing helpers.

## Risks

- **Auth field→drizzle mapping** completeness (types, references, plugin-added fields). Isolated in
  `authSchema`, table-tested against `getSchema`. Fallback: extend the type map as needed.
- **Statement splitting** relies on drizzle's `--> statement-breakpoint` markers from `generateMigration`.

## Commit policy

Files written, not committed by the agent except when explicitly creating the PR.
