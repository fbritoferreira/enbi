---
"@enbi/db": minor
"@enbi/server": minor
"@enbi/admin": minor
---

feat: per-collection field validation (ADR-0049)

Add `validate` option to `CollectionOptions` / `Collection` with a `FieldRule`
type supporting `required`, `type`, `min`, `max`, `pattern`, and `enum`
constraints. The server validates POST and PUT bodies before any DB write and
returns 422 with a structured `details` array of field-level errors on failure.
The admin UI marks required fields with a `*` in the label.
