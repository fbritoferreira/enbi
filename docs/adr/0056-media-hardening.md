# 56. Media upload hardening: size cap, MIME allowlist, nosniff

- Status: Accepted
- Date: 2026-06-22

## Context

ADR 0044 introduced the media upload endpoint (`POST /api/admin_media`) and public serving
(`GET /api/media/:id`). The initial implementation accepted any file type and any size, and the
serve route set no browser security headers. A code review identified three gaps:

1. **No size limit** — an attacker could exhaust server disk by uploading arbitrarily large files.
2. **SVG uploads** — `image/svg+xml` can contain `<script>` tags that execute when the browser
   opens the file inline, enabling stored XSS via the public media URL.
3. **Content-type sniffing** — without `X-Content-Type-Options: nosniff`, some browsers may
   re-interpret the served bytes, bypassing the stored MIME type.

## Decision

### Upload validation (POST /api/admin_media)

- **Size cap:** reject uploads exceeding 10 MB (`file.size > 10 * 1024 * 1024`). Returns HTTP 413
  via the new `"too_large"` EnbiError code.
- **MIME allowlist:** accept only `image/jpeg`, `image/png`, `image/gif`, `image/webp`, and
  `image/avif`. Any other MIME type (including `image/svg+xml`) is rejected. Returns HTTP 415
  via the new `"unsupported_media"` EnbiError code.
- Validation is performed against the browser-declared `file.type` after `parseBody()`. No
  magic-byte sniffing — this is consistent with the rest of the framework's input validation
  posture.

### Serve hardening (GET /api/media/:id)

Every media serve response now includes:

- `X-Content-Type-Options: nosniff` — prevents browser MIME-type sniffing.
- `Content-Disposition: inline` — signals inline display without letting the browser guess
  the disposition.

### EnbiError codes added

Two new codes added to `packages/db/src/errors.ts`:

- `"too_large"` → HTTP 413
- `"unsupported_media"` → HTTP 415

## Consequences

- **Good:** disk exhaustion via upload is bounded to 10 MB per file.
- **Good:** SVG-based stored XSS is eliminated — SVG is not in the allowlist.
- **Good:** `nosniff` closes the content-type sniffing attack surface on the serve route.
- **Tradeoff:** operators cannot upload SVG, PDF, or other binary formats through the admin UI.
  This is intentional; the allowlist can be extended in a future ADR if a use-case justifies it.
- **Non-goal:** magic-byte validation (files are trusted to declare their type correctly in the
  multipart Content-Type header — same posture as the rest of the framework).
- **Non-goal:** virus scanning.
