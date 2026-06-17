# Architecture Decision Records

Each ADR captures one significant decision: its context, the choice, and the consequences.
Format is lightweight [MADR](https://adr.github.io/madr/). ADRs are immutable once Accepted;
to change a decision, add a new ADR that supersedes the old one (don't edit history).

| ADR                                              | Decision                                                              | Status   |
| ------------------------------------------------ | --------------------------------------------------------------------- | -------- |
| [0001](0001-framework-distribution-model.md)     | Distribute enbi as a framework, not scaffolded source                 | Accepted |
| [0002](0002-astro-admin-over-hono-http.md)       | Admin UI is Astro talking to the Hono API over HTTP                   | Accepted |
| [0003](0003-drizzle-orm-three-drivers.md)        | Drizzle ORM as the DB/config surface; support Postgres, SQLite, MySQL | Accepted |
| [0004](0004-full-row-snapshot-versioning.md)     | Content history via full row snapshots per save                       | Accepted |
| [0005](0005-better-auth-for-auth.md)             | better-auth for all authentication (incl. SSO)                        | Accepted |
| [0006](0006-vite-plus-toolchain.md)              | Vite+ (`vp`) as the unified toolchain                                 | Accepted |
| [0007](0007-enbi-npm-scope-and-cli.md)           | `@enbi/*` npm scope and `enbi` CLI binary                             | Accepted |
| [0008](0008-oidc-trusted-publishing-ci.md)       | Publish via npm Trusted Publishing (OIDC) with hardened CI/CD         | Accepted |
| [0009](0009-scaffolding-first-no-logic.md)       | First deliverable is scaffolding only, no business logic              | Accepted |
| [0010](0010-monorepo-package-layout.md)          | Monorepo package layout and dependency direction                      | Accepted |
| [0011](0011-cli-manual-exports.md)               | CLI manages its own `bin`/`exports` (no `vp pack` auto-exports)       | Accepted |
| [0012](0012-ci-runs-on-all-prs.md)               | CI runs on every pull request, not only the main branch               | Accepted |
| [0013](0013-harden-runner-audit-before-block.md) | harden-runner runs in audit mode before switching to egress block     | Accepted |
| [0014](0014-content-type-drizzle-wrapper.md)     | Content types are Drizzle tables registered via `collection()`        | Accepted |
| [0015](0015-generic-revisions-table.md)          | Snapshots live in one generic `_revisions` table                      | Accepted |
| [0016](0016-auto-rest-per-collection.md)         | Content API is auto-generated REST per collection                     | Accepted |
| [0017](0017-rbac-roles-per-collection.md)        | RBAC: roles with per-collection permissions (better-auth AC)          | Accepted |
| [0018](0018-single-enbi-config.md)               | Single `enbi.config.ts` defines db, auth, roles, collections          | Accepted |
| [0019](0019-public-access-bypass.md)             | Public access: a `public` role and per-collection public actions      | Accepted |
| [0020](0020-native-api-keys.md)                  | Native API-key auth (better-auth plugin unavailable)                  | Accepted |
| [0021](0021-gpl-2-license.md)                    | License the project under GPL-2.0-only                                | Accepted |
| [0022](0022-cla-in-ci.md)                        | Require a signed CLA, enforced in CI                                  | Accepted |
| [0023](0023-publish-on-merge.md)                 | Publish to npm on merge to the default branch                         | Accepted |
| [0024](0024-github-release-and-changelog.md)     | Each npm release also cuts a GitHub Release with a changelog          | Accepted |
| [0025](0025-release-triggered-publish.md)        | npm publish is triggered by the GitHub Release event                  | Accepted |
