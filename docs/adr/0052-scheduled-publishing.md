# 52. Scheduled publishing: read-time visibility gating via publish_at

- Status: Accepted
- Date: 2026-06-21

## Context

Draft/publish (ADR-0045) controls whether content is visible based on an explicit
status value. It does not address time-based visibility: content that has been
approved but should only become public after a specific date and time.

Without a built-in mechanism, operators must implement their own time-check in
their delivery layer, undermining the value of the content API as a single source
of truth for read rules.

## Decision

### Collection opt-in

`CollectionOptions.scheduled?: boolean | { column?: string }` is added to
`@enbi/db`. The normalized value stored on `Collection.scheduled` is either
`{ column: string }` or `false`:

- `true` → `{ column: "publish_at" }`
- `{ column: "my_col" }` → `{ column: "my_col" }`
- omitted / `false` → `false` (no scheduled filtering)

**Requirement:** the user's Drizzle table MUST include the named column as a
nullable text column storing ISO-8601 UTC timestamps. Enbi cannot
introspect-validate this at collection registration time; the schema contract is
documented here. If the column is missing, the database will reject
inserts/queries at runtime.

### Read-time gating (public callers only)

Public callers (role `"public"`) see a row only when the `publish_at` column is
`NULL` or its value is `<=` the current UTC time (`new Date().toISOString()`).
Authenticated callers (any non-public role) see all rows regardless of
`publish_at`.

- `GET /api/:collection` — the gate is expressed as a SQL predicate
  (`OR(IS NULL, LTE now)`) passed as `extraWhere` to both `listRows` and
  `countRows`. Because `extraWhere` is AND-combined with the filter-derived
  `WHERE` clause at the SQL level, it applies even when the user supplies
  `_match=any`. The `X-Total-Count` header reflects the filtered count.
- `GET /api/:collection/:id` — after fetching the row, if `col.scheduled` is
  truthy, the caller is public, and `row[col.scheduled.column]` is set and its
  ISO-8601 string value is greater than `new Date().toISOString()`, a 404 is
  returned.

### Composition with drafts

Both gates compose correctly (AND) when a collection opts into both:

- The drafts filter is added to the `filters` array and enforces `match="all"`.
- The scheduled gate is expressed as `extraWhere` and is always AND-combined
  with the filter-derived clause, regardless of the user's `_match` setting.

A row is visible to a public caller only when it is `"published"` AND its
`publish_at` is `NULL` or in the past.

### Admin UI

`GET /api/admin_collections` now includes a `scheduled: { column: string } | false`
field in each collection's metadata array entry. On the `edit.astro` admin page,
when `col.scheduled` is truthy, the `publish_at` column's label is annotated with
a "(schedule)" hint. The field is a normal text input — the admin does not enforce
ISO-8601 format; that responsibility rests with the operator's table schema and the
client sending the value.

## Consequences

- **Good:** time-based visibility is enforced at the API layer, so all public
  clients — websites, mobile apps, preview builds — automatically respect the
  schedule without extra logic.
- **Good:** the gate is read-time only; no background process or cron job is
  required, eliminating operational complexity and race conditions around row
  expiry.
- **Good:** authenticated callers always see all rows, so editors can preview
  and manage scheduled content via the admin UI.
- **Good:** composes correctly with drafts — a row must be both published and
  past its `publish_at` to be public.
- **Bad:** the "schedule" is one-directional — once `publish_at` passes the row
  becomes permanently visible to the public unless the operator changes it. There
  is no expiry/unpublish-at concept in this iteration.
- **Bad:** timezone handling is delegated entirely to the caller: dates must be
  stored as UTC ISO-8601. No timezone conversion or local-time scheduling is
  provided.

## Non-goals

- Background job or cron that flips a `status` column at the scheduled time.
- Expiry / unpublish-at (a second timestamp that hides content after a deadline).
- Timezone-aware scheduling beyond UTC ISO-8601 string comparison.
- Scheduled webhooks that fire at `publish_at`.
- Validation that the column exists in the table schema (runtime contract only).
