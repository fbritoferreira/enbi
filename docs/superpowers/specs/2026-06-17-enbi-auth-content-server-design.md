# enbi — Auth + Content Server (Design)

Date: 2026-06-17
Status: Approved (build)

## Context

Second sub-project after scaffolding. Builds real logic into four packages at once —
`@enbi/db`, `@enbi/core`, `@enbi/auth`, `@enbi/server` — because they are mutually dependent: the
content server needs auth + versioning + a real DB layer, and auth needs the DB layer. Landed as
**one spec with staged, independently-testable tasks** (db → core → auth → server) so review still
happens in slices.

### Decisions locked in brainstorming

- **Scope:** db + core + auth + server together.
- **Content types:** user writes Drizzle tables, then registers them with `collection(table, opts)`
  (Drizzle owns shape; enbi owns behavior). (ADR-0014)
- **Versioning store:** one generic `_revisions` table, full row snapshot per save. (ADR-0004, ADR-0015)
- **API:** auto-generated REST per collection + `/revisions` + `/restore`. (ADR-0016)
- **Auth:** better-auth (pinned `1.7.0-beta.6`) — email/password, social (GitHub/Google), SSO/OIDC,
  sessions. (ADR-0005)
- **API keys:** native `_api_keys` table + `apiKeyProvider` (better-auth api-key plugin absent from
  the installed builds). (ADR-0020)
- **License:** GPL-2.0-only, with a CLA enforced in CI. (ADR-0021, ADR-0022)
- **Release:** publish to npm on merge to main/master, version-gated. (ADR-0023)
- **Public access:** a `public` role for anonymous + per-collection public actions that skip auth. (ADR-0019)
- **RBAC:** roles + per-collection permissions via better-auth access-control. (ADR-0017)
- **Config:** single `enbi.config.ts` via `defineEnbiConfig`. (ADR-0018)
- **Dialects:** Postgres, SQLite, MySQL (ADR-0003). Tests run on in-memory SQLite.

## Architecture

```
enbi.config.ts (user)
  └─ defineEnbiConfig({ db, auth, roles, collections })
        │
@enbi/db      createDb(db) → Drizzle instance ; collection(table,opts) ; _revisions ; schema aggregator
        │                          │
@enbi/core    writeRevision/listRevisions/restoreRevision  (pure, over _revisions)
        │
@enbi/auth    createAuth(db, auth, roles) → better-auth (+plugins) ; requireSession ; requirePermission
        │
@enbi/server  createServer(config) → Hono: /api/auth/*, /api/:collection (+/revisions,/restore), /health
        │
@enbi/admin   (later) HTTP only
```

No cycles: `server → {auth, core, db}`, `auth → db`, `core → db`.

## `@enbi/db`

- `defineEnbiConfig(config)` — typed identity helper; returns the config object.
- `createDb(dbConfig)` — dialect→driver factory returning a Drizzle instance:
  - postgres → `drizzle-orm/node-postgres`, sqlite → `drizzle-orm/libsql`, mysql → `drizzle-orm/mysql2`.
- `collection(table, options)` — registers a Drizzle table. `options`: `{ name, title?, versioned?, permissionsKey? }`. Returns `Collection` (table + resolved metadata + primary-key accessor).
- `_revisions` table (dialect-aware JSON column: `jsonb` pg / `json` mysql / `text` sqlite):
  `id, collection, entryId, version, snapshot, authorId, createdAt`.
- `buildSchema(collections)` — aggregates user tables + `_revisions` + better-auth tables into one
  object for `drizzle-kit generate` (per dialect) and runtime.

## `@enbi/core`

Pure snapshot engine over `_revisions`, no HTTP/auth:

- `writeRevision(db, { collection, entryId, data, authorId })` → inserts next-version full snapshot.
- `listRevisions(db, { collection, entryId })` → ordered revisions.
- `restoreRevision(db, table, { collection, entryId, version })` → returns snapshot to re-apply.
- `nextVersion` computed as `max(version)+1` per `(collection, entryId)`.

## `@enbi/auth`

- `createAuth(db, authConfig, roles)` → better-auth instance configured with the Drizzle adapter and
  plugins: email/password, social (GitHub/Google), SSO/OIDC, API key, and access-control
  (roles + statements derived from `roles` config × collections).
- Statement shape: resource = collection name, actions = `read|create|update|delete`.
- Middleware: `requireSession(auth)` (session cookie **or** API key) and
  `requirePermission(auth, collection, action)`.
- Exports the better-auth Drizzle schema for the db aggregator.

## `@enbi/server`

- `createServer(config)`: `createDb` → `createAuth` → mount routes.
- `/api/auth/*` → `auth.handler`.
- For each collection: `GET /api/:c` (list), `GET /api/:c/:id`, `POST /api/:c`, `PUT /api/:c/:id`,
  `DELETE /api/:c/:id`, `GET /api/:c/:id/revisions`, `POST /api/:c/:id/restore`.
- Write flow: `requireSession` → `requirePermission(c, action)` → validate body → write row → (if
  versioned) `core.writeRevision` → respond.
- `/health` → `{status:"ok"}`.

### Error handling

Typed errors → HTTP: 401 (no session/key), 403 (permission denied), 404 (missing entry/collection),
422 (validation), 409 (version conflict on restore). Central Hono `onError`.

## Testing

- In-memory SQLite (`libsql`/`:memory:`) for unit + integration.
- `@enbi/db`: createDb (sqlite), collection registry, `_revisions` schema round-trip.
- `@enbi/core`: write/list/restore, version increment.
- `@enbi/auth`: createAuth boots; email/password signup+login; `requirePermission` allow/deny.
- `@enbi/server`: `app.request()` integration — full CRUD, history+restore, auth 401/403, RBAC.
- Cross-dialect (Postgres/MySQL container) tests are a flagged follow-up, not this slice.

## Out of scope (later)

- Admin UI wiring (own sub-project).
- Cross-dialect container test matrix.
- Field-level validation schemas beyond presence/type; rich query/filtering/pagination beyond basics.
- Media/file upload handling.

## Risks

- **better-auth API surface** (plugins, adapter) evolves; code against the installed version's types,
  not docs from memory.
- **JSON column portability** across three dialects — isolate in the `_revisions` column helper.
- **Migration generation** per dialect via drizzle-kit — keep schema aggregator dialect-parametric.

## Commit policy

Files written, not committed by the agent (user commits). (memory: enbi-no-commit)
