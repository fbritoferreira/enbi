---
"@enbi/db": minor
"@enbi/server": minor
"@enbi/admin": minor
---

Add local-disk media uploads: a `_media` table (included in migrations), a `MediaStore` interface with `diskStore` implementation, four server routes (`POST/GET/DELETE /api/admin_media`, public `GET /api/media/:id`), and an admin `/media` page with upload form and file list.
