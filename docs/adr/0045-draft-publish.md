# 45. Draft/publish: per-collection status-gated visibility

- Status: Accepted
- Date: 2026-06-20

## Context

Collections often have content that is under preparation and should not be
visible to end-users until explicitly approved. Without a built-in mechanism,
operators must either hide the collection entirely (using permissions) or
build custom filtering in their own API layer, undermining the value of a
managed content API.

Specific gaps that drove this decision:

- **No draft concept** — any created entry was immediately visible to all
  callers with read access, including anonymous/public ones.
- **No publish workflow** — there was no way to mark an entry as "ready"
  without deleting and re-creating it or adding a bespoke status column with
  manual filtering.
- **No admin affordance** — editors had no UI control to transition an entry
  between draft and published states.

## Decision

### Collection opt-in

`CollectionOptions.drafts?: boolean | { column?: string }` is added to
`@enbi/db`. The normalized value stored on `Collection.drafts` is either
`{ column: string }` or `false`:

- `true` → `{ column: "status" }`
- `{ column: "my_col" }` → `{ column: "my_col" }`
- omitted / `false` → `false` (no draft filtering)

**Requirement:** the user's Drizzle table MUST include the named column as a
text column. Enbi cannot introspect-validate this at collection registration
time; the schema contract is documented here. If the column is missing, the
database will reject inserts/queries at runtime.

### Read filtering

Public callers (role `"public"` — anonymous requests or any caller whose role
matches `PUBLIC_ROLE` from `guard.ts`) only see rows where the status column
equals `"published"`. Authenticated callers with any non-public role see all
statuses.

- `GET /api/:collection` — an equality filter `{ column, op: "eq", value: "published" }`
  is appended to the filter set (applied to both `listRows` and `countRows`) when
  `col.drafts` is truthy and the caller is public. The `X-Total-Count` header reflects
  the filtered count.
- `GET /api/:collection/:id` — after fetching the row, if `col.drafts` is truthy and
  the caller is public and `row[col.drafts.column] !== "published"`, a 404 is returned,
  making unpublished entries invisible to the public.

### Create default

`POST /api/:collection` — when `col.drafts` is truthy and the request body
has no value for the status column, the column is defaulted to `"draft"`.
This ensures that new content is never accidentally published without an
explicit intent.

### Admin UI

`GET /api/admin_collections` now includes a `drafts: { column: string } | false`
field in each collection's metadata payload. On the `edit.astro` admin page, when
`col.drafts` is truthy and the entry is not new, a "Publish" / "Unpublish" toggle
button is rendered. Clicking the button reads the current form values, overrides
the status column with the next state (`"published"` or `"draft"`), and PUTs the
full entry. On success the page navigates back to the entries list. All values are
set via `.textContent` (safe DOM assignment — no raw HTML interpolation).

## Consequences

- **Good:** collections that opt in expose only safe, approved content to
  anonymous visitors without any extra server-side logic from the operator.
- **Good:** new entries are safe-by-default — they start as drafts and must
  be explicitly published.
- **Good:** the column name is configurable, supporting tables that already
  use a different column (e.g. `state`, `visibility`).
- **Good:** authenticated callers (editors, admins) always see all statuses,
  so drafts are manageable via the existing list and edit UI.
- **Non-goal:** scheduled publish (future: a `publish_at` timestamp column).
- **Non-goal:** per-field drafts or partial visibility.
- **Non-goal:** workflow states beyond `draft` / `published` (e.g. `review`,
  `archived`).
- **Non-goal:** server-side validation that the status column exists in the
  table schema (runtime contract only).
- **Non-goal:** blocking revision snapshots of a published entry from containing
  historical draft content — a snapshot records the row as it existed at the time
  of the write, regardless of the status value at that moment.
