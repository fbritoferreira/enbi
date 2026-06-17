# enbi — CLI (`enbi dev/build/start/migrate`) Design

Date: 2026-06-17
Status: Approved (build)

## Context

`@enbi/cli` is the framework entrypoint (ADR-0001): an end-user runs `enbi <cmd>` and the CLI loads
their `enbi.config.ts`, boots the Hono content server and the Astro admin from `node_modules`. Until
now `@enbi/cli` only printed `--version`. This sub-project makes the framework runnable.

### Decisions (brainstorm)

- **Commands:** `dev`, `build`, `start`, and a `migrate` **stub** (filled by the migrations sub-project).
- **Dev DB:** `dev` **auto-syncs** the schema (drizzle-kit `push`) so tables exist for fast iteration (ADR-0028).
- **Admin:** dev/build/start drive the Astro admin via Astro's **programmatic Node API** (ADR-0029).
- **Config loading:** `enbi.config.ts` is loaded with **jiti** (runtime TS, no build step) (ADR-0027).
- **Arg parsing:** `cac`.

## Architecture

```
enbi <cmd>  (bin/enbi.ts → cac)
  ├─ dev    → loadConfig → syncSchema(push) → createServer → @hono/node-server  ┐ parallel
  │                                                         + astro dev (admin) ┘ + watch→restart
  ├─ build  → astro build (admin)
  ├─ start  → loadConfig → createServer → serve (prod) + serve built admin
  └─ migrate→ stub (EnbiError "coming soon")
```

## Modules (`tools/cli/src`)

- `config.ts` — `loadConfig(cwd, configPath?)`: resolve `enbi.config.ts` (or `--config`), load via jiti,
  validate it is an `EnbiConfig` (db/auth/roles/collections), else throw `EnbiError("config", …)`.
- `sync.ts` — `syncSchema(config)`: build the schema (`buildSchema` from `@enbi/db`) and apply it to the
  configured dialect via drizzle-kit `push` (create/update tables, incl. `_revisions`, `_api_keys`, and
  the better-auth tables). Dev-only convenience (ADR-0028).
- `commands/dev.ts` — load → sync → boot server (`createServer`, `@hono/node-server`, `--port`) +
  Astro dev (admin) in parallel; watch `enbi.config.ts` and restart the server on change.
- `commands/build.ts` — Astro `build()` for the admin. (Server is a library — nothing to build.)
- `commands/start.ts` — load → `createServer` → serve (no watch); serve the built admin output.
- `commands/migrate.ts` — `throw new EnbiError("config", "enbi migrate — coming soon (migrations sub-project)")`.
- `index.ts` — exports `getVersion`, `run(argv)`.
- `bin/enbi.ts` — cac wiring + central error handler (typed `EnbiError` → message + nonzero exit).

## Admin via Astro programmatic API (ADR-0029)

`@enbi/admin` lives in `node_modules`. The CLI imports `astro` and runs `dev({ root })` / `build({ root })`
with `root` resolved to the admin package directory (`require.resolve("@enbi/admin/package.json")` → dirname).
No shelling out to a binary. Astro is an optional/peer dep of the CLI.

## Error handling

All commands throw typed `EnbiError`. `bin/enbi.ts` catches, prints `enbi: <message>`, exits with a
nonzero code. Unknown errors exit 1 with the stack in `--verbose`.

## Testing (sqlite `:memory:` + tmp dir)

- `loadConfig`: write a tmp `enbi.config.ts`, load it, assert collections/roles parsed; missing file →
  `EnbiError`; non-config export → `EnbiError`.
- `syncSchema`: push to sqlite, assert the content table + `_revisions` exist (query `sqlite_master`).
- `start`: boot via the start command against a tmp sqlite config, assert `GET /health` → 200.
- `migrate`: asserts it throws `EnbiError` with code `config`.
- arg routing: `run([...])` dispatches `dev/build/start/migrate` to the right handler (handlers stubbed/spied).

## Out of scope

- Real migrations (`enbi migrate`) — next sub-project.
- Production admin serving niceties (CDN, base path) — admin sub-project.
- Hot-reload of content types beyond a server restart.

## Risks

- **Astro programmatic dev/build** booted from `node_modules` (also flagged in ADR-0002). Fallback:
  spawn the `astro` binary in the admin dir. Documented in ADR-0029.
- **drizzle-kit push** programmatic API surface; pin against the installed version, isolate in `sync.ts`.

## Commit policy

Files written, not committed by the agent except when explicitly creating the PR for this goal.
