# Architecture Decision Records

Each ADR captures one significant decision: its context, the choice, and the consequences.
Format is lightweight [MADR](https://adr.github.io/madr/). ADRs are immutable once Accepted;
to change a decision, add a new ADR that supersedes the old one (don't edit history).

| ADR                                                   | Decision                                                               | Status             |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| [0001](0001-framework-distribution-model.md)          | Distribute enbi as a framework, not scaffolded source                  | Accepted           |
| [0002](0002-astro-admin-over-hono-http.md)            | Admin UI is Astro talking to the Hono API over HTTP                    | Accepted           |
| [0003](0003-drizzle-orm-three-drivers.md)             | Drizzle ORM as the DB/config surface; support Postgres, SQLite, MySQL  | Accepted           |
| [0004](0004-full-row-snapshot-versioning.md)          | Content history via full row snapshots per save                        | Accepted           |
| [0005](0005-better-auth-for-auth.md)                  | better-auth for all authentication (incl. SSO)                         | Accepted           |
| [0006](0006-vite-plus-toolchain.md)                   | Vite+ (`vp`) as the unified toolchain                                  | Accepted           |
| [0007](0007-enbi-npm-scope-and-cli.md)                | `@enbi/*` npm scope and `enbi` CLI binary                              | Accepted           |
| [0008](0008-oidc-trusted-publishing-ci.md)            | Publish via npm Trusted Publishing (OIDC) with hardened CI/CD          | Accepted           |
| [0009](0009-scaffolding-first-no-logic.md)            | First deliverable is scaffolding only, no business logic               | Accepted           |
| [0010](0010-monorepo-package-layout.md)               | Monorepo package layout and dependency direction                       | Accepted           |
| [0011](0011-cli-manual-exports.md)                    | CLI manages its own `bin`/`exports` (no `vp pack` auto-exports)        | Accepted           |
| [0012](0012-ci-runs-on-all-prs.md)                    | CI runs on every pull request, not only the main branch                | Accepted           |
| [0013](0013-harden-runner-audit-before-block.md)      | harden-runner runs in audit mode before switching to egress block      | Accepted           |
| [0014](0014-content-type-drizzle-wrapper.md)          | Content types are Drizzle tables registered via `collection()`         | Accepted           |
| [0015](0015-generic-revisions-table.md)               | Snapshots live in one generic `_revisions` table                       | Accepted           |
| [0016](0016-auto-rest-per-collection.md)              | Content API is auto-generated REST per collection                      | Accepted           |
| [0017](0017-rbac-roles-per-collection.md)             | RBAC: roles with per-collection permissions (better-auth AC)           | Accepted           |
| [0018](0018-single-enbi-config.md)                    | Single `enbi.config.ts` defines db, auth, roles, collections           | Accepted           |
| [0019](0019-public-access-bypass.md)                  | Public access: a `public` role and per-collection public actions       | Accepted           |
| [0020](0020-native-api-keys.md)                       | Native API-key auth (better-auth plugin unavailable)                   | Accepted           |
| [0021](0021-gpl-2-license.md)                         | License the project under GPL-2.0-only                                 | Accepted           |
| [0022](0022-cla-in-ci.md)                             | Require a signed CLA, enforced in CI                                   | Accepted           |
| [0023](0023-publish-on-merge.md)                      | Publish to npm on merge to the default branch                          | Superseded by 0026 |
| [0024](0024-github-release-and-changelog.md)          | Each npm release also cuts a GitHub Release with a changelog           | Superseded by 0026 |
| [0025](0025-release-triggered-publish.md)             | npm publish is triggered by the GitHub Release event                   | Superseded by 0026 |
| [0026](0026-changesets.md)                            | Use changesets for versioning, changelogs, releases & OIDC publish     | Accepted           |
| [0027](0027-cli-config-loading-jiti.md)               | Load `enbi.config.ts` at runtime with jiti                             | Accepted           |
| [0028](0028-dev-auto-sync-schema.md)                  | `enbi dev` auto-syncs the schema (drizzle-kit push)                    | Accepted           |
| [0029](0029-cli-drives-astro-programmatically.md)     | The CLI drives the Astro admin via Astro's programmatic API            | Accepted           |
| [0030](0030-versioned-migrations.md)                  | Versioned migration files with a lightweight apply runner              | Accepted           |
| [0031](0031-unify-auth-tables-into-drizzle-schema.md) | Unify better-auth tables into the drizzle schema via `getSchema`       | Accepted           |
| [0032](0032-playwright-api-e2e-and-keys.md)           | Playwright API-level e2e (in CI) + `enbi keys`                         | Accepted           |
| [0033](0033-admin-route-prefix.md)                    | System routes are namespaced under `admin_`                            | Accepted           |
| [0034](0034-http-key-management.md)                   | HTTP API-key management, admin-gated, first-user bootstrap             | Accepted           |
| [0035](0035-cross-dialect-testcontainers.md)          | Cross-dialect testing with testcontainers                              | Accepted           |
| [0036](0036-sso-e2e-mock-idp.md)                      | SSO e2e against a mock OIDC provider (testcontainers + browser)        | Accepted           |
| [0037](0037-testable-dev-build.md)                    | Testable `enbi dev`/`build` via closable handles + artifact assertion  | Accepted           |
| [0038](0038-query-pagination.md)                      | Content list query params: offset pagination + equality filters        | Accepted           |
| [0039](0039-auth-setup.md)                            | `enbi auth setup` prints a config snippet and seeds `.env.example`     | Accepted           |
| [0040](0040-egress-block.md)                          | CI egress flipped from audit to block with a known-good allowlist      | Accepted           |
| [0041](0041-admin-ui.md)                              | Astro admin functional core: login, collections, entry CRUD, keys      | Accepted           |
| [0042](0042-richer-query.md)                          | Richer query: filter operators, match mode, keyset cursor pagination   | Accepted           |
| [0043](0043-admin-full.md)                            | Admin full: provider buttons, role management, revisions, search       | Accepted           |
| [0044](0044-media-uploads.md)                         | Media uploads: local-disk store, `_media` table, public serving        | Accepted           |
| [0045](0045-draft-publish.md)                         | Draft/publish: per-collection status-gated public visibility           | Accepted           |
| [0046](0046-relations.md)                             | Relations: FK field → target collection with opt-in `?expand`          | Accepted           |
| [0047](0047-webhooks.md)                              | Outbound webhooks on content mutations (HMAC, fire-and-forget)         | Accepted           |
| [0048](0048-cross-site-cookie.md)                     | Cross-domain admin cookie support (`SameSite=None; Secure`)            | Accepted           |
| [0049](0049-field-validation.md)                      | Per-collection field validation (required/type/min/max/pattern/enum)   | Accepted           |
| [0050](0050-i18n.md)                                  | Field-level i18n via a `_translations` table + `?locale=` overlay      | Accepted           |
| [0051](0051-admin-redesign-wysiwyg.md)                | Editorial Terminal design; first-run register; wysiwyg CKEditor widget | Accepted           |
