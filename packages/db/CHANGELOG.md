# @enbi/db

## 0.11.0

## 0.10.0

### Minor Changes

- f73a205: feat: scheduled publishing via read-time publish_at gating (ADR-0052)

  Adds `scheduled?: boolean | { column?: string }` to `CollectionOptions` in
  `@enbi/db`. When enabled, public callers only see rows whose `publish_at`
  column is NULL or <= now (UTC ISO-8601); authenticated callers see all rows.
  The gate is applied at read time (no background job). Composes correctly with
  the existing drafts/publish gate (AND). Exposed in `/api/admin_collections`
  metadata; the edit form labels the column with a "(schedule)" hint.

## 0.9.0

### Minor Changes

- f5fc2ae: feat: Editorial Terminal design system, first-run register flow, and wysiwyg field type (ADR-0051)

  Redesigns the admin UI with the Editorial Terminal design system (offline-safe CSS custom
  properties, serif display font, vermilion accent, fixed sidebar). Adds a first-run
  `/register` page backed by `GET /api/admin_setup`, auto-redirected to from login and index
  when no users exist. Adds a `wysiwyg` field widget rendered with CKEditor classic build,
  storing HTML via a hidden input so the existing submit logic is unchanged.

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

## 0.7.0

### Minor Changes

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add `admin.crossSite` config flag: when true, the session cookie is issued as `SameSite=None; Secure` so it is sent on cross-origin fetches from an admin on a different domain. Requires HTTPS. The same-site/different-port setup (Lax + CORS + trustedOrigins) is unaffected.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add draft/publish support: per-collection opt-in via `CollectionOptions.drafts`; public callers see only `status="published"` rows; POST defaults new entries to `"draft"`; admin edit page shows a Publish/Unpublish toggle.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add local-disk media uploads: a `_media` table (included in migrations), a `MediaStore` interface with `diskStore` implementation, four server routes (`POST/GET/DELETE /api/admin_media`, public `GET /api/media/:id`), and an admin `/media` page with upload form and file list.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add relations between collections: declare FK field → target collection via `CollectionOptions.relations`; opt-in `?expand=field` expansion nests the target row under `_expanded[field]`; null on missing FK; admin select widget for relation fields.

- [#30](https://github.com/fbritoferreira/enbi/pull/30) [`bac4594`](https://github.com/fbritoferreira/enbi/commit/bac4594c35d44fe37567f3d24038dab38c2283d5) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add outbound webhooks on content mutations: configure endpoints via `webhooks` in `EnbiConfig`; filter by event type and collection; optional HMAC-SHA256 signing via `X-Enbi-Signature`; fire-and-forget delivery that never blocks the request path.

## 0.6.0

## 0.5.2

## 0.5.1

## 0.5.0

## 0.4.0

## 0.3.0

### Minor Changes

- [#9](https://github.com/fbritoferreira/enbi/pull/9) [`bb0d24c`](https://github.com/fbritoferreira/enbi/commit/bb0d24c3bf19020f03a0d386c43134b6f21388cc) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Add migrations: `enbi generate` writes versioned migration files (drizzle-kit diff) and `enbi migrate` applies pending ones, tracked in `_enbi_migrations`. better-auth's tables are translated into the drizzle schema (`@enbi/auth` `authSchema` via `getSchema`) and unified with content + `_revisions` + `_api_keys`, so one pipeline migrates everything and `enbi dev` auto-sync now includes session-auth tables too.

## 0.2.0

## 0.1.1

### Patch Changes

- [#4](https://github.com/fbritoferreira/enbi/pull/4) [`52065a4`](https://github.com/fbritoferreira/enbi/commit/52065a4136d8e979fb00c18b90c6d638fec893c3) Thanks [@fbritoferreira](https://github.com/fbritoferreira)! - Harden the release pipeline: publish via pnpm with corepack on PATH, OIDC trusted publishing (no token), and ignore the bot-written CLA signatures file in formatting. First fully-automated, tokenless release.

## 0.1.0

### Minor Changes

- Initial release: auth, content server, versioning and RBAC.
  - **@enbi/db**: `defineEnbiConfig`, `createDb` (SQLite/Postgres/MySQL), `collection()` wrapper that preserves user Drizzle indexes/constraints, generic `_revisions` and `_api_keys` tables, and `buildSchema`.
  - **@enbi/core**: full row-snapshot content versioning — `writeRevision`, `listRevisions`, `getRevision`, `restoreRevision`.
  - **@enbi/auth**: better-auth (email/password, social, SSO via genericOAuth, admin roles), a pure `can()` RBAC check, native API keys, and a default `public` role.
  - **@enbi/server**: auto-generated REST per collection with auth gating, versioning, and per-collection public-action bypass.
  - **@enbi/admin**: Astro admin scaffold that talks to the content server over HTTP.
  - **@enbi/cli**: the `enbi` binary (`--version`).
