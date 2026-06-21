# @enbi/cli

## 0.9.0

### Patch Changes

- Updated dependencies [f5fc2ae]
  - @enbi/db@0.9.0
  - @enbi/server@0.9.0
  - @enbi/auth@0.9.0

## 0.8.0

### Patch Changes

- Updated dependencies [[`61fb8c7`](https://github.com/fbritoferreira/enbi/commit/61fb8c725c457c89e1202825039eac22d8976617), [`a711f81`](https://github.com/fbritoferreira/enbi/commit/a711f81ce055c89fbd0d635a67f6501eea1242ff)]:
  - @enbi/db@0.8.0
  - @enbi/server@0.8.0
  - @enbi/auth@0.8.0

## 0.7.0

### Patch Changes

- Updated dependencies [[`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`84f8bcb`](https://github.com/fbritoferreira/enbi/commit/84f8bcb60aba70582cfcb5ef568a845c643ea65f), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5)]:
  - @enbi/server@0.7.0
  - @enbi/db@0.7.0
  - @enbi/auth@0.7.0

## 0.6.0

### Minor Changes

- [#20](https://github.com/fbritoferreira/enbi/pull/20) [`0017283`](https://github.com/fbritoferreira/enbi/commit/0017283f61c39147992430a3b80d2a79d1f6f09a) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Content API gains query params (`limit`/`offset`/`sort`/equality filters) with an `X-Total-Count` header, an admin-only `GET /api/admin_collections` metadata endpoint, and optional CORS + better-auth `trustedOrigins` for a configured admin origin. New `enbi auth setup <github|google|oidc>` scaffolds an auth provider. The Astro admin gains a functional core: login, collections, entry CRUD, and API-key management.

### Patch Changes

- Updated dependencies [[`0017283`](https://github.com/fbritoferreira/enbi/commit/0017283f61c39147992430a3b80d2a79d1f6f09a)]:
  - @enbi/server@0.6.0
  - @enbi/auth@0.6.0
  - @enbi/db@0.6.0

## 0.5.2

### Patch Changes

- [#18](https://github.com/fbritoferreira/enbi/pull/18) [`0632d04`](https://github.com/fbritoferreira/enbi/commit/0632d0426364abd544f2fe0cf481ddd8be984742) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - `enbi dev` and `startAdminDev` now return closable handles (`DevHandle` / `AdminHandle`), so the dev server and admin can be stopped programmatically. No change to the `dev`/`build` CLI behavior.

- Updated dependencies []:
  - @enbi/server@0.5.2
  - @enbi/auth@0.5.2
  - @enbi/db@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`08add8c`](https://github.com/fbritoferreira/enbi/commit/08add8c993bd5c8de18f2d3ca227e1c3fb40bcbb)]:
  - @enbi/auth@0.5.1
  - @enbi/server@0.5.1
  - @enbi/db@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies [[`220ddda`](https://github.com/fbritoferreira/enbi/commit/220dddaacb8fa696d61a18d2934c63331c70b1f1)]:
  - @enbi/server@0.5.0
  - @enbi/auth@0.5.0
  - @enbi/db@0.5.0

## 0.4.0

### Minor Changes

- [#11](https://github.com/fbritoferreira/enbi/pull/11) [`19005f9`](https://github.com/fbritoferreira/enbi/commit/19005f92584632a4f102c17970490dc625b3c6b8) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add `enbi keys` (create/list/revoke) and API-key management helpers (`issueApiKey`/`listApiKeys`/`revokeApiKey`). Fix the better-auth Drizzle adapter to receive the generated schema so session signup/login works against migrated tables. Add Playwright API-level e2e (signup/login/session, API-key, denied paths) that boots the real CLI and runs in CI.

### Patch Changes

- Updated dependencies [[`19005f9`](https://github.com/fbritoferreira/enbi/commit/19005f92584632a4f102c17970490dc625b3c6b8)]:
  - @enbi/auth@0.4.0
  - @enbi/server@0.4.0
  - @enbi/db@0.4.0

## 0.3.0

### Minor Changes

- [#9](https://github.com/fbritoferreira/enbi/pull/9) [`bb0d24c`](https://github.com/fbritoferreira/enbi/commit/bb0d24c3bf19020f03a0d386c43134b6f21388cc) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add migrations: `enbi generate` writes versioned migration files (drizzle-kit diff) and `enbi migrate` applies pending ones, tracked in `_enbi_migrations`. better-auth's tables are translated into the drizzle schema (`@enbi/auth` `authSchema` via `getSchema`) and unified with content + `_revisions` + `_api_keys`, so one pipeline migrates everything and `enbi dev` auto-sync now includes session-auth tables too.

### Patch Changes

- Updated dependencies [[`bb0d24c`](https://github.com/fbritoferreira/enbi/commit/bb0d24c3bf19020f03a0d386c43134b6f21388cc)]:
  - @enbi/auth@0.3.0
  - @enbi/db@0.3.0
  - @enbi/server@0.3.0

## 0.2.0

### Minor Changes

- [#7](https://github.com/fbritoferreira/enbi/pull/7) [`93653ae`](https://github.com/fbritoferreira/enbi/commit/93653ae873aa02fd3d806269baaca457b6d6f9f4) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Implement the `enbi` CLI commands: `dev` (load `enbi.config.ts` via jiti, auto-sync the schema with drizzle-kit push, boot the Hono server, and run the Astro admin), `build` (build the admin), `start` (production server), and a `migrate` stub (filled by the migrations sub-project). Config loading, schema sync, and command routing are covered by tests.

### Patch Changes

- Updated dependencies []:
  - @enbi/server@0.2.0
  - @enbi/db@0.2.0

## 0.1.1

### Patch Changes

- [#4](https://github.com/fbritoferreira/enbi/pull/4) [`52065a4`](https://github.com/fbritoferreira/enbi/commit/52065a4136d8e979fb00c18b90c6d638fec893c3) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Harden the release pipeline: publish via pnpm with corepack on PATH, OIDC trusted publishing (no token), and ignore the bot-written CLA signatures file in formatting. First fully-automated, tokenless release.

- Updated dependencies [[`52065a4`](https://github.com/fbritoferreira/enbi/commit/52065a4136d8e979fb00c18b90c6d638fec893c3)]:
  - @enbi/server@0.1.1

## 0.1.0

### Minor Changes

- Initial release: auth, content server, versioning and RBAC.
  - **@enbi/db**: `defineEnbiConfig`, `createDb` (SQLite/Postgres/MySQL), `collection()` wrapper that preserves user Drizzle indexes/constraints, generic `_revisions` and `_api_keys` tables, and `buildSchema`.
  - **@enbi/core**: full row-snapshot content versioning — `writeRevision`, `listRevisions`, `getRevision`, `restoreRevision`.
  - **@enbi/auth**: better-auth (email/password, social, SSO via genericOAuth, admin roles), a pure `can()` RBAC check, native API keys, and a default `public` role.
  - **@enbi/server**: auto-generated REST per collection with auth gating, versioning, and per-collection public-action bypass.
  - **@enbi/admin**: Astro admin scaffold that talks to the content server over HTTP.
  - **@enbi/cli**: the `enbi` binary (`--version`).

### Patch Changes

- Updated dependencies []:
  - @enbi/server@0.1.0
