---
"@enbi/db": minor
"@enbi/server": minor
"@enbi/admin": minor
---

Add draft/publish support: per-collection opt-in via `CollectionOptions.drafts`; public callers see only `status="published"` rows; POST defaults new entries to `"draft"`; admin edit page shows a Publish/Unpublish toggle.
