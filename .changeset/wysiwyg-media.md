---
"@enbi/admin": minor
---

Wire CKEditor image upload to `/api/admin_media` via a FileRepository upload adapter. Pasting, dropping, or inserting images in wysiwyg fields now uploads to the media library and embeds the absolute public URL. Auth via session cookie; no new dependencies.
