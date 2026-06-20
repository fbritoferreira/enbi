# 44. Media uploads: local-disk store, `_media` table, admin management, and public serving

- Status: Accepted
- Date: 2026-06-20

## Context

Content editors need to attach images and other files to their entries. The framework had no
concept of media — every file had to be managed out-of-band and referenced by an external URL.
This left a gap between structured content (managed via enbi collections) and unstructured binary
assets (left entirely to the operator). A built-in upload mechanism closes this gap for the
typical self-hosted case, while remaining simple enough not to complicate cloud deployments.

Specific gaps that drove this decision:

- **No upload endpoint** — there was nowhere to POST a file and get back a URL to embed in content.
- **No asset storage** — assets had to live outside the enbi deployment entirely.
- **No admin UI** — editors had no way to manage uploaded files without direct filesystem or database access.

## Decision

### `_media` table

A new internal table (alongside `_revisions` and `_api_keys`) stores upload metadata: `id`
(UUID), `filename`, `mime`, `size`, and `createdAt`. The table is included in the Drizzle schema
passed to migration generation, so `enbi generate` and `enbi migrate` create it automatically.
Per-dialect variants (sqlite / postgres / mysql) follow the same pattern as the existing internal
tables in `packages/db/src/media.ts`. The `media: MediaTable` field is added to `EnbiDb` and
`mediaFor(dialect)` is added to `buildSchema`, so the table is always available via the
connection context.

### `MediaStore` interface and `diskStore` implementation

A `MediaStore` interface (`put / get / delete`) decouples the upload handler from the storage
backend. The only built-in implementation is `diskStore(dir)`, which stores each file as
`<dir>/<id>` using `node:fs/promises`. The upload directory defaults to `.enbi/uploads` and is
configurable via `EnbiConfig.media.dir`. The directory is created recursively on first use.
The interface leaves room for a future object-storage (S3-compatible) adapter without changing
the route logic.

### Server routes (`mountMedia`)

Four routes are mounted in `createServer` after `mountKeys`:

- `POST /api/admin_media` — parses a `multipart/form-data` body via Hono's `parseBody()`, stores
  the file bytes via `store.put`, inserts a `_media` row, and returns `{ id, filename, mime, size,
url }` 201. Admin-only (`allowReadShorthand: false`).
- `GET /api/admin_media` — lists all rows ordered by `createdAt`. Admin-only.
- `DELETE /api/admin_media/:id` — deletes the row and the stored bytes; 404 if the row is
  missing. Admin-only.
- `GET /api/media/:id` — serves the stored bytes with the recorded `Content-Type`. **Public** —
  no authentication required, so assets embedded in public content are accessible without a
  session.

### Admin page (`/media`)

A new `/media` Astro page provides an upload form (`<input type="file">`) and a list of uploaded
files. The upload uses a raw `fetch` with `credentials: "include"` rather than `enbiFetch`,
because `enbiFetch` unconditionally sets `content-type: application/json`, which would corrupt the
multipart boundary. The list and delete actions use `enbiFetch` as normal. All interpolated values
are escaped with `escapeHtml`. A "Media" link is added to the `Admin.astro` navigation header.

## Consequences

- **Good:** editors can upload files directly from the admin UI and get a stable URL to embed in
  content.
- **Good:** the `MediaStore` interface makes a future S3/R2 adapter straightforward — swap the
  implementation, keep the routes unchanged.
- **Good:** public `GET /api/media/:id` means assets work without authentication, matching the
  expectation for embedded images in public content.
- **Non-goal:** image transforms, resizing, or thumbnail generation.
- **Non-goal:** S3 or any remote object-storage adapter (interface only in this ADR).
- **Non-goal:** virus scanning or content moderation of uploads.
- **Non-goal:** access control on individual assets (all served assets are public once uploaded).
