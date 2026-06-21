# ADR-0055 CKEditor image upload wired to `/api/admin_media`

**Status:** Accepted  
**Date:** 2026-06-22

## Context

ADR-0051 introduced the `wysiwyg` widget in the admin edit form via CKEditor classic
build. That ADR explicitly noted as a known limitation:

> Image upload inside the editor is not wired to the media library. Authors must
> upload files via the Media page and paste URLs manually. This is a future iteration.

The enbi media library (`/api/admin_media`, introduced in ADR-0044) already accepts
multipart `POST` uploads authenticated by session cookie and returns a stable public URL
at `/api/media/<id>`. The CKEditor classic build bundles the `FileRepository`, `Image`,
and `ImageUpload` plugins, which together provide a generic upload adapter interface
that any consumer can implement.

Pasting or dropping images into a CKEditor field without a registered adapter silently
discards them. Authors working with image-heavy content had no path to embed images
except copy-pasting raw `<img>` markup.

## Decision

Inside the `ClassicEditor.create(...).then(editor => { ... })` callback in
`apps/admin/src/pages/edit.astro`, after wiring the `setData` / `change:data` sync,
install a `createUploadAdapter` function on the bundled `FileRepository` plugin:

1. Retrieve the `FileRepository` plugin instance via `editor.plugins.get("FileRepository")`.
   Because CKEditor's TypeScript types do not expose `FileRepository` by string key,
   the result is cast with `as unknown` then narrowed to a locally-declared
   `FileRepositoryPlugin` interface. No `eslint-disable` is used.

2. `createUploadAdapter` returns an object with `upload` and `abort` methods. `upload`:
   - awaits `loader.file` to obtain the `File` object,
   - wraps it in a `FormData` with the `"file"` key (matching the server expectation),
   - calls `fetch(apiBase() + "/api/admin_media", { method: "POST", credentials: "include", body: fd })` — raw `fetch`, not `enbiFetch`, because `enbiFetch` always sets `content-type: application/json`, which would override the multipart boundary,
   - throws on non-OK responses so CKEditor surfaces the error in its UI,
   - returns `{ default: apiBase() + json.url }` — an absolute URL so the embedded `<img>` loads cross-origin from the server regardless of where the admin is hosted.

3. `apiBase()` is imported from `../lib/api.ts` alongside the existing `enbiFetch` /
   `escapeHtml` imports. No new dependencies are added.

The uploaded image URL is embedded in the field HTML by CKEditor. The existing
`change:data` listener already syncs `editor.getData()` to the hidden input on every
change, so the image reference persists through the normal save flow without any
additional wiring.

## Consequences

- **Good:** authors can paste, drop, or insert images directly into wysiwyg fields
  without leaving the editor or touching the Media page manually.
- **Good:** uploaded assets land in the shared media library and are served via the
  existing public `/api/media/<id>` endpoint — no new storage path.
- **Good:** auth is via the existing session cookie; no new credentials or tokens.
- **Good:** zero new npm dependencies — the adapter is ~20 lines of inline client-side
  code re-using existing infrastructure.
- **Bad:** the embedded URL is absolute (includes the server origin from `apiBase()`).
  Content exported from one environment and imported into another will contain
  hard-coded origins. Accepted: this mirrors standard media-library behaviour.
- **Bad:** CKEditor shows a generic error message on upload failure; the underlying
  HTTP status is logged to the browser console but not surfaced to the author in detail.
  Acceptable for an admin tool at this stage.

## Non-goals

- Image resizing or format transforms at upload time.
- Drag-reorder of multiple images within the editor.
- Alt-text enforcement or accessibility linting within CKEditor.
- A custom upload-progress UI (CKEditor's built-in progress bar is sufficient).
