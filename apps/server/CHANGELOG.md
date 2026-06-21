# @enbi/server

## 0.8.0

### Minor Changes

- [#31](https://github.com/fbritoferreira/enbi/pull/31) [`61fb8c7`](https://github.com/fbritoferreira/enbi/commit/61fb8c725c457c89e1202825039eac22d8976617) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - feat: per-collection field validation (ADR-0049)

  Add `validate` option to `CollectionOptions` / `Collection` with a `FieldRule`
  type supporting `required`, `type`, `min`, `max`, `pattern`, and `enum`
  constraints. The server validates POST and PUT bodies before any DB write and
  returns 422 with a structured `details` array of field-level errors on failure.
  The admin UI marks required fields with a `*` in the label.

- [#32](https://github.com/fbritoferreira/enbi/pull/32) [`a711f81`](https://github.com/fbritoferreira/enbi/commit/a711f81ce055c89fbd0d635a67f6501eea1242ff) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - feat: field-level i18n via `_translations` table (ADR-0050)

  Add opt-in `localized` fields to collections and a `_translations` side-table
  storing per-locale field overrides. The server overlays translations on GET
  responses when `?locale=` is supplied, and exposes `GET/PUT
/api/:col/:id/translations/:locale` endpoints. The admin edit page gains a
  locale switcher that loads and saves translations for non-default locales.

### Patch Changes

- Updated dependencies [[`61fb8c7`](https://github.com/fbritoferreira/enbi/commit/61fb8c725c457c89e1202825039eac22d8976617), [`a711f81`](https://github.com/fbritoferreira/enbi/commit/a711f81ce055c89fbd0d635a67f6501eea1242ff)]:
  - @enbi/db@0.8.0
  - @enbi/auth@0.8.0
  - @enbi/core@0.8.0

## 0.7.0

### Minor Changes

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - The admin gains a public `/api/admin_providers` endpoint listing configured OAuth and SSO provider ids for the login page's sign-in buttons; a `/users` page for viewing and updating user roles via the better-auth admin plugin; a `/revisions` page for browsing snapshot history and restoring previous versions; and richer `__like`-based entries search that filters on the collection's title column rather than requiring an exact id match.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add draft/publish support: per-collection opt-in via `CollectionOptions.drafts`; public callers see only `status="published"` rows; POST defaults new entries to `"draft"`; admin edit page shows a Publish/Unpublish toggle.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add local-disk media uploads: a `_media` table (included in migrations), a `MediaStore` interface with `diskStore` implementation, four server routes (`POST/GET/DELETE /api/admin_media`, public `GET /api/media/:id`), and an admin `/media` page with upload form and file list.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add relations between collections: declare FK field → target collection via `CollectionOptions.relations`; opt-in `?expand=field` expansion nests the target row under `_expanded[field]`; null on missing FK; admin select widget for relation fields.

- [#22](https://github.com/fbritoferreira/enbi/pull/22) [`84f8bcb`](https://github.com/fbritoferreira/enbi/commit/84f8bcb60aba70582cfcb5ef568a845c643ea65f) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add richer filter operators, OR match mode, and keyset cursor pagination to the collection list endpoint. `GET /api/<collection>` now accepts operator suffixes on filter keys (`field__like`, `field__gte`, `field__ne`, `field__in`, etc.), a `_match=any` parameter to combine filters with OR semantics, and a `cursor=<pk>` parameter for keyset pagination that returns `X-Next-Cursor` on full pages. Offset pagination and plain `?field=value` equality filters remain fully backward-compatible.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add outbound webhooks on content mutations: configure endpoints via `webhooks` in `EnbiConfig`; filter by event type and collection; optional HMAC-SHA256 signing via `X-Enbi-Signature`; fire-and-forget delivery that never blocks the request path.

### Patch Changes

- Updated dependencies [[`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5), [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5)]:
  - @enbi/db@0.7.0
  - @enbi/auth@0.7.0
  - @enbi/core@0.7.0

## 0.6.0

### Minor Changes

- [#20](https://github.com/fbritoferreira/enbi/pull/20) [`0017283`](https://github.com/fbritoferreira/enbi/commit/0017283f61c39147992430a3b80d2a79d1f6f09a) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Content API gains query params (`limit`/`offset`/`sort`/equality filters) with an `X-Total-Count` header, an admin-only `GET /api/admin_collections` metadata endpoint, and optional CORS + better-auth `trustedOrigins` for a configured admin origin. New `enbi auth setup <github|google|oidc>` scaffolds an auth provider. The Astro admin gains a functional core: login, collections, entry CRUD, and API-key management.

### Patch Changes

- Updated dependencies [[`0017283`](https://github.com/fbritoferreira/enbi/commit/0017283f61c39147992430a3b80d2a79d1f6f09a)]:
  - @enbi/auth@0.6.0
  - @enbi/core@0.6.0
  - @enbi/db@0.6.0

## 0.5.2

### Patch Changes

- Updated dependencies []:
  - @enbi/auth@0.5.2
  - @enbi/core@0.5.2
  - @enbi/db@0.5.2

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
