---
"@enbi/db": minor
"@enbi/server": minor
"@enbi/admin": minor
---

feat: Editorial Terminal design system, first-run register flow, and wysiwyg field type (ADR-0051)

Redesigns the admin UI with the Editorial Terminal design system (offline-safe CSS custom
properties, serif display font, vermilion accent, fixed sidebar). Adds a first-run
`/register` page backed by `GET /api/admin_setup`, auto-redirected to from login and index
when no users exist. Adds a `wysiwyg` field widget rendered with CKEditor classic build,
storing HTML via a hidden input so the existing submit logic is unchanged.
