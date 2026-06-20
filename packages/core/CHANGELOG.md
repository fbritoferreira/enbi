# @enbi/core

## 0.7.0

### Patch Changes

- Updated dependencies [[`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5)]:
  - @enbi/db@0.7.0

## 0.6.0

### Patch Changes

- Updated dependencies []:
  - @enbi/db@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @enbi/db@0.5.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @enbi/db@0.5.1

## 0.5.0

### Patch Changes

- Updated dependencies []:
  - @enbi/db@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies []:
  - @enbi/db@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [[`bb0d24c`](https://github.com/fbritoferreira/enbi/commit/bb0d24c3bf19020f03a0d386c43134b6f21388cc)]:
  - @enbi/db@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @enbi/db@0.2.0

## 0.1.1

### Patch Changes

- [#4](https://github.com/fbritoferreira/enbi/pull/4) [`52065a4`](https://github.com/fbritoferreira/enbi/commit/52065a4136d8e979fb00c18b90c6d638fec893c3) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Harden the release pipeline: publish via pnpm with corepack on PATH, OIDC trusted publishing (no token), and ignore the bot-written CLA signatures file in formatting. First fully-automated, tokenless release.

- Updated dependencies [[`52065a4`](https://github.com/fbritoferreira/enbi/commit/52065a4136d8e979fb00c18b90c6d638fec893c3)]:
  - @enbi/db@0.1.1

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
