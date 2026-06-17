# @enbi/cli

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
