# enbi

A framework-distributed, headless CMS. You install enbi as packages and configure it with
code — your repo holds only your database config, your custom content types, and your auth
config. The `enbi` CLI boots the content server and admin UI from your dependencies; you never
vendor the framework source.

**Headline features**

- **Full content history** — every save writes a complete versioned snapshot, so any entry can
  be diffed and restored.
- **Auth via better-auth** — sessions, providers, and SSO, configured by you.
- **Drizzle-defined content** — model your content types in code; Postgres, SQLite, and MySQL.

## This repository

`enbi` is the **framework source** — a [Vite+](https://viteplus.dev) monorepo. End-users do not
clone this; they install the published `@enbi/*` packages.

| Package        | Role                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `@enbi/db`     | Drizzle config surface + driver adapters (Postgres / SQLite / MySQL) |
| `@enbi/core`   | Content history / snapshot versioning engine                         |
| `@enbi/auth`   | better-auth wiring (incl. SSO)                                       |
| `@enbi/server` | Hono content API                                                     |
| `@enbi/admin`  | Astro admin UI (talks to the server over HTTP)                       |
| `@enbi/cli`    | The `enbi` binary — `dev` / `build` / `start`                        |

Dependency direction is acyclic: `cli → server → {core, auth, db}`; the admin only ever talks to
the server over HTTP.

## Toolchain

Everything runs through Vite+ (`vp`): `vp pack` (tsdown) builds the libraries, Astro builds the
admin, `vp test` runs Vitest, and `vp check` formats, lints, and type-checks. Run `vp help` for
the full command list; docs are local under `node_modules/vite-plus/docs`.

## Development

```bash
vp install              # install dependencies (run after pulling, before anything else)
vp check                # format + lint + type check
vp run -r test          # run every package's tests
vp run -r build         # build every package, in dependency order
vp run -r --parallel dev  # run all dev servers
```

A one-shot "is it green?" gate:

```bash
vp run ready            # vp check && vp run -r test && vp run -r build
```

## Documentation

- `docs/adr/` — Architecture Decision Records: the _why_ behind every choice.
- `docs/superpowers/specs/` — design specs per sub-project.
- `docs/superpowers/plans/` — step-by-step implementation plans.

## Status

Early scaffolding. Subsystems are built one at a time; each has its own spec, plan, and ADRs.
