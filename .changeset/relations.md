---
"@enbi/db": minor
"@enbi/server": minor
"@enbi/admin": minor
---

Add relations between collections: declare FK field → target collection via `CollectionOptions.relations`; opt-in `?expand=field` expansion nests the target row under `_expanded[field]`; null on missing FK; admin select widget for relation fields.
