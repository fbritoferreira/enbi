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

| Package        | Role                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| `@enbi/db`     | Drizzle config surface + driver adapters (Postgres / SQLite / MySQL)            |
| `@enbi/core`   | Content history / snapshot versioning engine                                    |
| `@enbi/auth`   | better-auth wiring (incl. SSO)                                                  |
| `@enbi/server` | Hono content API                                                                |
| `@enbi/admin`  | Astro admin UI (talks to the server over HTTP)                                  |
| `@enbi/cli`    | The `enbi` binary — `dev` / `build` / `start` / `generate` / `migrate` / `keys` |

Dependency direction is acyclic: `cli → server → {core, auth, db}`; the admin only ever talks to
the server over HTTP.

## Using enbi (end-user)

Install the packages, write an `enbi.config.ts`, then drive it with the CLI:

```bash
enbi generate   # write a versioned migration from your schema (./drizzle)
enbi migrate    # apply pending migrations to your database
enbi dev        # auto-sync schema + run the content server and admin
enbi start      # production server
enbi keys create --role admin --label ci   # mint an API key (shown once)
enbi keys list
enbi keys revoke <id>
```

Auth (sessions, social, SSO) is better-auth, served at `/api/admin_auth/*`; API keys and a `public`
role are built in. Content is served as auto-generated REST per collection, with full revision
history. System routes are namespaced under `admin_` (so a collection can't be named `auth`/`keys`).

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
vp run ready            # vp run -r build && vp check && vp run -r test
```

End-to-end tests (Playwright, API-level against the real CLI server) run in CI and locally:

```bash
pnpm e2e                # boots `enbi migrate && enbi start`, hits it over HTTP
```

## Documentation

- `docs/adr/` — Architecture Decision Records: the _why_ behind every choice.
- `docs/superpowers/specs/` — design specs per sub-project.
- `docs/superpowers/plans/` — step-by-step implementation plans.

## Status

Early development. Subsystems are built one at a time; each has its own spec, plan, and ADRs.

## License

enbi is licensed under the **GNU General Public License v2.0** (`GPL-2.0-only`) — see [`LICENSE`](LICENSE).
Contributions require a signed [CLA](CLA.md), enforced automatically on every pull request.
