---
"@enbi/server": patch
---

Batch relation-expand and i18n overlay queries in the list path to eliminate N+1 patterns (one `inArray` query per expand field, one per locale overlay). No API change.
