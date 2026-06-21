---
"@enbi/db": minor
"@enbi/server": minor
"@enbi/admin": minor
---

feat: scheduled publishing via read-time publish_at gating (ADR-0052)

Adds `scheduled?: boolean | { column?: string }` to `CollectionOptions` in
`@enbi/db`. When enabled, public callers only see rows whose `publish_at`
column is NULL or <= now (UTC ISO-8601); authenticated callers see all rows.
The gate is applied at read time (no background job). Composes correctly with
the existing drafts/publish gate (AND). Exposed in `/api/admin_collections`
metadata; the edit form labels the column with a "(schedule)" hint.
