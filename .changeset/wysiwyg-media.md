---
"@enbi/admin": minor
"@enbi/server": minor
---

Wire CKEditor image upload to `/api/admin_media` via a FileRepository upload adapter. Pasting, dropping, or inserting images in wysiwyg fields now uploads to the media library and embeds the absolute public URL. Auth via session cookie; no new dependencies.

Server hardening: uploads are capped at 10 MB (HTTP 413) and restricted to image MIME types — jpeg, png, gif, webp, avif (HTTP 415). The public serve route (`GET /api/media/:id`) now sets `X-Content-Type-Options: nosniff` and `Content-Disposition: inline`.
