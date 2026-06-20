# 46. Relations: FK field → target collection with opt-in expansion

- Status: Accepted
- Date: 2026-06-20

## Context

Collections had no way to express foreign-key relationships between them. Before this decision:

- **No relationship declarations** — collections were isolated; there was no way to
  declare that a column holds a reference to another collection's primary key.
- **No automatic lookup** — embedding related data required custom API middleware
  outside enbi, forcing operators to build their own join/expansion logic.
- **No admin affordance** — the admin UI rendered raw FK id values as plain text,
  making it impossible for editors to identify which target row a FK referenced
  without manual lookup.

## Decision

### Declaring relations

`CollectionOptions.relations?: Record<string, { collection: string }>` is added
to `@enbi/db`. The normalized value stored on `Collection.relations` defaults to
`{}` (no relations).

Each key is a JS property name in the table row object (the column holding the
target row's primary key); the value specifies the target collection's `name`:

```typescript
const users = defineCollection("users", {
  relations: {
    company_id: { collection: "companies" },
  },
});
```

**Requirement:** the column MUST hold values that are valid primary keys of the
target collection. This is a runtime contract enforced at fetch time, not
validated at collection registration time. If a FK value is invalid or the
target collection is unregistered at runtime, the lookup fails gracefully (see
Opt-in expansion below).

### Opt-in expansion

`GET /api/:collection` and `GET /api/:collection/:id` accept a `?expand=field1,field2`
query parameter. The `expand` parameter is reserved (not parsed as a filter).

For each comma-separated field in `expand`:

- **Declared check** — the field must be a declared relation (key in
  `Collection.relations`). If not, return 400 Bad Request.
- **Target registration check** — the target collection must be registered.
  If not, return 500 Internal Server Error (indicates a configuration error).
- **Lookup** — the FK value is looked up via `getRow(targetCollection, fkValue)`.
  If the target row exists, it is attached under the row's `_expanded[field]` object.
- **Null handling** — `_expanded[field]` is `null` when the FK is empty/null or
  when the target row is not found (no error is raised).
- **Original FK preserved** — the original FK field is not clobbered; both
  `field` (the original ID) and `_expanded[field]` (the full row) are present
  in the response.

### Admin UI

`GET /api/admin_collections` now includes a `relations: Record<string, { collection: string }>`
field in each collection's metadata payload.

On the `edit.astro` admin page:

- For any column that is a declared relation field, a `<select>` widget is rendered
  (not a text input) with options populated from `GET /api/<target>?limit=100`.
- Primary key columns always render as `<input readonly>` regardless of whether
  they are relation fields.
- The select displays human-readable values (e.g. the target row's `name` or
  `title` column if available) instead of raw IDs.

### N+1 fetch

For list expansion (e.g. `GET /api/:collection?expand=field`), each row triggers
a separate `getRow` call per expanded field (N+1 pattern). This is acceptable at
this scale — CMS collections are typically small, and list expansion is
explicitly opt-in. The decision to accept N+1 is documented here so future
optimizers know this trade-off was intentional.

## Consequences

- **Good:** zero-config for non-relational collections — existing collections
  need no changes.
- **Good:** opt-in per-request — callers choose when to pay the lookup cost.
  Non-relational API consumers are unaffected.
- **Good:** null on missing FK is safe and predictable — there is no ambiguity
  about what happens when a FK points to a deleted or invalid row.
- **Good:** admin UI can show human-readable labels instead of raw IDs, improving
  editor experience.
- **Non-goal:** join-level optimization (no SQL JOIN rewrite).
- **Non-goal:** reverse relations (target → source lookups; use separate queries).
- **Non-goal:** many-to-many relations (express these via a junction collection).
- **Non-goal:** deep/nested expand (expanding relations within an expanded row).
- **Non-goal:** server-side validation that the FK column exists in the table schema
  (runtime contract only).
