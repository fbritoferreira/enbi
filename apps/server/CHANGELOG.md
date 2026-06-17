# @enbi/server

## 0.5.1

### Patch Changes

- [#15](https://github.com/fbritoferreira/enbi/pull/15) [`08add8c`](https://github.com/fbritoferreira/enbi/commit/08add8c993bd5c8de18f2d3ca227e1c3fb40bcbb) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Record `last_used_at` when an API key authenticates, and return 409 when creating a content entry whose id already exists. Adds a full-stack cross-dialect test suite (SQLite + Postgres/MySQL via testcontainers) exercising generate → migrate → server → content/versioning + auth bootstrap + key management on every dialect.

- Updated dependencies [[`08add8c`](https://github.com/fbritoferreira/enbi/commit/08add8c993bd5c8de18f2d3ca227e1c3fb40bcbb)]:
  - @enbi/auth@0.5.1
  - @enbi/core@0.5.1
  - @enbi/db@0.5.1

## 0.5.0

### Minor Changes

- [#13](https://github.com/fbritoferreira/enbi/pull/13) [`220ddda`](https://github.com/fbritoferreira/enbi/commit/220dddaacb8fa696d61a18d2934c63331c70b1f1) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add HTTP API-key management at `/api/admin_keys` (`GET` list / `POST` create / `DELETE` revoke), gated by a `keys` permission resource — admin-only (the `read` role shorthand does not grant it). The first user created is promoted to `admin` so a fresh install has a super-admin without a manual DB edit. Covered by server unit tests and Playwright e2e.

### Patch Changes

- Updated dependencies [[`220ddda`](https://github.com/fbritoferreira/enbi/commit/220dddaacb8fa696d61a18d2934c63331c70b1f1)]:
  - @enbi/auth@0.5.0
  - @enbi/core@0.5.0
  - @enbi/db@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [[`19005f9`](https://github.com/fbritoferreira/enbi/commit/19005f92584632a4f102c17970490dc625b3c6b8)]:
  - @enbi/auth@0.4.0
  - @enbi/core@0.4.0
  - @enbi/db@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`bb0d24c`](https://github.com/fbritoferreira/enbi/commit/bb0d24c3bf19020f03a0d386c43134b6f21388cc)]:
  - @enbi/auth@0.3.0
  - @enbi/db@0.3.0
  - @enbi/core@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @enbi/auth@0.2.0
  - @enbi/core@0.2.0
  - @enbi/db@0.2.0

## 0.1.1

### Patch Changes

- [#4](https://github.com/fbritoferreira/enbi/pull/4) [`52065a4`](https://github.com/fbritoferreira/enbi/commit/52065a4136d8e979fb00c18b90c6d638fec893c3) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Harden the release pipeline: publish via pnpm with corepack on PATH, OIDC trusted publishing (no token), and ignore the bot-written CLA signatures file in formatting. First fully-automated, tokenless release.

- Updated dependencies [[`52065a4`](https://github.com/fbritoferreira/enbi/commit/52065a4136d8e979fb00c18b90c6d638fec893c3)]:
  - @enbi/db@0.1.1
  - @enbi/core@0.1.1
  - @enbi/auth@0.1.1

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
  - @enbi/db@0.1.0
  - @enbi/core@0.1.0
  - @enbi/auth@0.1.0
