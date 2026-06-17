# enbi — Sub-project 1: Monorepo Scaffolding (Design)

Date: 2026-06-17
Status: Approved for spec review

## Context

`enbi` is the source monorepo for a **framework-distributed headless CMS**. It ships as
published `@enbi/*` npm packages. An end-user's repo contains ONLY:

- a Drizzle config + custom content-type definitions,
- a better-auth config,

and runs the framework via the `enbi` CLI, which boots the server and admin UI from
`node_modules`. The user never holds the framework source — only their config + custom types.

This document covers **sub-project 1 only**: scaffolding the six packages, wiring the
monorepo, and tooling. **No business logic.** Per the project's new-package rule, the first
PR is scaffolding only; each subsystem's logic lands in its own later spec → plan → PR.

### Decisions locked during brainstorming

- **Distribution model:** Framework. Published packages (config + custom types only in user repos), not scaffolded source.
- **Admin UI:** Astro app talking to the Hono content server over HTTP. No second Hono frontend.
- **DB drivers:** Postgres, SQLite, MySQL (all three, via Drizzle).
- **Versioning model:** Full row snapshots per save (headline feature; logic is a later sub-project).
- **Auth:** better-auth for all auth needs (SSO etc; logic is a later sub-project).
- **npm scope / CLI:** `@enbi/*`, binary `enbi`. npm `enbi` org already registered.
- **Toolchain:** Vite+ (`vp`) — `tsdown` builds, vitest, oxlint/oxfmt via `vp check`. No hand-rolled rollup.
- **Publishing:** GitHub Actions → npm via **Trusted Publishing (OIDC)**. No long-lived `NPM_TOKEN`. See CI/CD section.

## Goal

A green monorepo: `vp install`, `vp check`, `vp run -r build`, `vp run -r test` all pass with
six wired packages exposing placeholder exports and a working dependency graph. Nothing does
real work yet.

## Package layout

| Path            | Package        | Role                                                                             | First-PR placeholder       |
| --------------- | -------------- | -------------------------------------------------------------------------------- | -------------------------- |
| `packages/db`   | `@enbi/db`     | Drizzle config surface (`defineConfig`, content-type helpers, 3 driver adapters) | empty typed exports        |
| `packages/core` | `@enbi/core`   | Versioning / history engine (snapshot model)                                     | empty typed exports        |
| `packages/auth` | `@enbi/auth`   | better-auth wiring                                                               | empty typed exports        |
| `apps/server`   | `@enbi/server` | Hono content API factory `createServer(config)`                                  | boots; `GET /health` → 200 |
| `apps/admin`    | `@enbi/admin`  | Astro admin UI                                                                   | default Astro page         |
| `tools/cli`     | `@enbi/cli`    | `enbi dev` / `build` / `start`                                                   | `enbi --version` only      |

Workspaces already declared in `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `tools/*`.

## Dependency direction

```
cli ──▶ server ──▶ core
                └─▶ auth
                └─▶ db
admin ──(HTTP only)──▶ server
```

No cycles. `admin` does not import server/core/auth/db at build time — it talks to the running
server over HTTP. `cli` depends on `server` (and transitively the rest) plus `admin` for the
`dev`/`build` orchestration in later sub-projects; for scaffolding it only needs its own `bin`.

## Per-package scaffolding contents

Each package gets:

- `package.json` — `name`, `type: module`, `exports` map (and `bin` for cli), workspace
  `dependencies` using the catalog where shared, `scripts` delegating to `vp`/`tsdown`.
- `tsconfig.json` — extends the root tsconfig; package-local `outDir`/`rootDir`.
- `src/index.ts` — placeholder export so the bundle is non-empty and types resolve. Examples:
  - `@enbi/db`: `export type EnbiDbConfig = { /* TODO sub-project 2 */ };`
  - `@enbi/core`: `export type Revision = { /* TODO */ };`
  - `@enbi/auth`: `export type EnbiAuthConfig = { /* TODO */ };`
  - `@enbi/server`: `export function createServer(): Hono` returning an app with `GET /health`.
  - `@enbi/cli`: `bin/enbi.ts` printing version from its own `package.json`.
- `tests/index.test.ts` — one trivial vitest assertion so `vp run -r test` is green.
- Build via `tsdown` (dual ESM, `.d.ts`), configured the Vite+ way.

`apps/admin` is an Astro project (`astro` dep, `astro.config`, a default page). Its build output
and how the CLI serves/embeds it from `node_modules` is a **later sub-project** — scaffolding only
proves it builds standalone.

## Cleanup

- Delete `apps/website` and `packages/utils` (Vite+ template leftovers).
- Update root `package.json` `dev` script (currently `vp run website#dev`) to a sensible default
  (e.g. `vp run @enbi/server#dev` once that script exists, or remove until sub-project 2).
- Keep root `vite.config.ts`, `pnpm-workspace.yaml`, catalog as-is; add deps to catalog as needed.

## Out of scope (later sub-projects, each its own spec)

- `@enbi/db` config surface + the three Drizzle driver adapters.
- `@enbi/core` snapshot versioning engine.
- `@enbi/auth` better-auth integration + SSO.
- `@enbi/server` real content API routes.
- `@enbi/admin` real admin UI + how the CLI serves it from node_modules.
- `@enbi/cli` `dev`/`build`/`start` command logic and config loading from a user repo.

## CI/CD — secure publishing to npm

Publishing uses **npm Trusted Publishing (OIDC)**, GA since 2025-07-31. The registry trusts a
specific GitHub Actions workflow in a specific repo+environment and mints a short-lived token at
publish time. **No `NPM_TOKEN` secret is ever stored** — which directly removes the credential the
Shai-Hulud worm family (Sept 2025 + 2.0 Nov/Dec 2025) steals from CI to self-propagate. Provenance
attestations are generated automatically (public repo required).

### Two separate workflows

1. **`.github/workflows/ci.yml`** — runs on `push` and `pull_request`. Does `vp install` (frozen
   lockfile), `vp check`, `vp run -r test`, `vp run -r build`. **No secrets, no `id-token`, no
   publish.** Default `GITHUB_TOKEN` permission `contents: read`. Untrusted PR code only ever runs
   here, where it has nothing to steal.
2. **`.github/workflows/release.yml`** — runs **only** on published GitHub Releases / pushed
   `v*` tags from the default branch (never on `pull_request` or `pull_request_target`). This is the
   only job granted `id-token: write` and the only one that publishes.

### release.yml hardening checklist

- **Per-job least privilege:** top-level `permissions: contents: read`; the publish job adds
  `id-token: write` (for OIDC) and `contents: read` only. No `packages:`/`contents: write` unless a
  later sub-project needs GitHub Releases automation, and then scoped to its own job.
- **OIDC trusted publishing, no token:** configure each `@enbi/*` package's npm settings with the
  trusted publisher (org `enbi`, repo, workflow filename `release.yml`, environment `npm-publish`).
  `actions/setup-node` + `npm publish` with no `NODE_AUTH_TOKEN`. Provenance auto-emitted.
- **GitHub Environment gate:** publish job runs in environment `npm-publish` with required-reviewer
  protection, so a human approves every release; OIDC subject is bound to that environment.
- **Pin every action to a full commit SHA**, not a tag (`uses: actions/checkout@<40-char-sha>`).
  Tags are mutable and are a known action-supply-chain vector. Renovate/Dependabot updates the SHAs.
- **Egress control:** first step is `step-security/harden-runner` (SHA-pinned) in
  `egress-policy: block` with an explicit allowlist (npm registry, GitHub). Blocks the
  exfiltration channel the worm uses even if a dep is compromised.
- **Block dependency lifecycle scripts:** install with scripts disabled. pnpm v10+ already does not
  run dependency build scripts unless allowlisted — enforce via `pnpm.onlyBuiltDependencies` (empty
  / explicit allowlist) in the workspace, and use `--frozen-lockfile`. The worm's payload runs from
  `postinstall`; disabling it neutralizes install-time execution in CI.
- **Cloud-hosted runners only** (`ubuntu-latest`) — required for OIDC trusted publishing; no
  self-hosted runners with ambient credentials.
- **No build/test of untrusted code in the publish job:** release runs only on tags from the
  protected default branch; it does not check out or execute PR-contributed code.
- **`concurrency`** guard so overlapping tag pushes can't double-publish.
- **Account hygiene (documented, not code):** phishing-resistant MFA on the npm `enbi` org and on
  maintainer GitHub accounts; no classic long-lived PATs.

This scaffolding PR lands both workflows in a **dry-run/build-only** posture (release.yml runs
`npm publish --dry-run`) so the pipeline is proven green before any real package is published in a
later sub-project. The trusted-publisher config in the npm UI is a manual one-time step the
maintainer performs per package.

## Testing / verification

- `vp install` clean.
- `vp check` (fmt + lint + typecheck) passes.
- `vp run -r build` builds all six packages.
- `vp run -r test` passes placeholder tests.
- `apps/admin` builds via its Astro build.
- `enbi --version` prints the CLI version when run from the built `bin`.
- `ci.yml` green on PR (no secrets/id-token). `release.yml` reaches `npm publish --dry-run`
  successfully on a test tag, with every action SHA-pinned and harden-runner in block mode.

## Open risks (flagged, not solved here)

- **Embedding Astro admin in a published package** booted from a user's `node_modules` is
  non-trivial (static build vs SSR, asset paths). Must be designed in the admin sub-project.
- **Drizzle config as the user's public API** — the exact `defineConfig` shape that maps custom
  types → tables → versioned snapshots is the core design problem of sub-project 2.

## Decision records

Every decision in this spec is recorded as an ADR under `docs/adr/` (MADR format): ADR-0001
(framework distribution), 0002 (Astro admin over HTTP), 0003 (Drizzle + 3 drivers), 0004 (snapshot
versioning), 0005 (better-auth), 0006 (Vite+ toolchain), 0007 (`@enbi/*` + `enbi` CLI), 0008 (OIDC
trusted publishing + hardened CI), 0009 (scaffolding-first), 0010 (package layout). New decisions
get new ADRs; superseded ones are marked, never edited away.

## Commit policy

Per repo rule: the user handles all commits. This file is written but **not** committed by the agent.
