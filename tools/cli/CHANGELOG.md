# @enbi/cli

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
