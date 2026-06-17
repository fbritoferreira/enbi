# Architecture Decision Records

Each ADR captures one significant decision: its context, the choice, and the consequences.
Format is lightweight [MADR](https://adr.github.io/madr/). ADRs are immutable once Accepted;
to change a decision, add a new ADR that supersedes the old one (don't edit history).

| ADR                                          | Decision                                                              | Status   |
| -------------------------------------------- | --------------------------------------------------------------------- | -------- |
| [0001](0001-framework-distribution-model.md) | Distribute enbi as a framework, not scaffolded source                 | Accepted |
| [0002](0002-astro-admin-over-hono-http.md)   | Admin UI is Astro talking to the Hono API over HTTP                   | Accepted |
| [0003](0003-drizzle-orm-three-drivers.md)    | Drizzle ORM as the DB/config surface; support Postgres, SQLite, MySQL | Accepted |
| [0004](0004-full-row-snapshot-versioning.md) | Content history via full row snapshots per save                       | Accepted |
| [0005](0005-better-auth-for-auth.md)         | better-auth for all authentication (incl. SSO)                        | Accepted |
| [0006](0006-vite-plus-toolchain.md)          | Vite+ (`vp`) as the unified toolchain                                 | Accepted |
| [0007](0007-enbi-npm-scope-and-cli.md)       | `@enbi/*` npm scope and `enbi` CLI binary                             | Accepted |
| [0008](0008-oidc-trusted-publishing-ci.md)   | Publish via npm Trusted Publishing (OIDC) with hardened CI/CD         | Accepted |
| [0009](0009-scaffolding-first-no-logic.md)   | First deliverable is scaffolding only, no business logic              | Accepted |
| [0010](0010-monorepo-package-layout.md)      | Monorepo package layout and dependency direction                      | Accepted |
| [0011](0011-cli-manual-exports.md)           | CLI manages its own `bin`/`exports` (no `vp pack` auto-exports)       | Accepted |
| [0012](0012-ci-runs-on-all-prs.md)           | CI runs on every pull request, not only the main branch               | Accepted |
