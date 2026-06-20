# 49. Per-collection field validation

- Status: Accepted
- Date: 2026-06-20

## Context

Content collections in enbi accept arbitrary JSON bodies. Without schema-level
constraints the server relies entirely on the underlying database (NOT NULL,
type coercions) to reject invalid data. This is too late: the error messages
are opaque SQL errors, they surface only one failure at a time, and they cannot
express semantic rules such as minimum length, value bounds, email format, or
enumerated lists.

A lightweight, declarative validation layer on the server — invoked before any
DB write — lets collection authors express these constraints in `defineEnbiConfig`
and gives API consumers structured, field-level error responses.

## Decision

### Config — `@enbi/db`

`CollectionOptions` gains an optional field:

```typescript
validate?: Record<string, FieldRule>
```

`FieldRule` is a new exported type:

```typescript
export type FieldRule = {
  required?: boolean;
  type?: "string" | "number" | "boolean" | "email" | "url";
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
};
```

`Collection` (the resolved type returned by `collection()`) carries:

```typescript
validate: Record<string, FieldRule>; // defaults to {}
```

### Validator — `apps/server/src/validate.ts`

A pure function with no side effects:

```typescript
export type FieldError = { field: string; message: string };

export function validateFields(
  rules: Record<string, FieldRule>,
  body: Record<string, unknown>,
): FieldError[];
```

Rules applied in order per field:

1. **required** — field absent, `null`, `undefined`, or empty-string → error.
   If the field is absent/empty AND not required → skip all remaining checks.
2. **type** — `"string"`: `typeof === "string"`; `"number"`: `Number.isFinite(Number(v))`
   (accepts numeric strings); `"boolean"`: strict `true`/`false`;
   `"email"`: basic email regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`);
   `"url"`: `new URL()` parse succeeds. Type mismatch → error; remaining checks
   skipped (cascading noise avoided).
3. **min/max** — for string values: length bounds; for number values (or numeric
   strings): value bounds. Both checked independently (two errors possible).
4. **pattern** — `new RegExp(rule.pattern).test(String(value))`. An invalid
   regex source is a config error; it produces a dedicated error message rather
   than crashing.
5. **enum** — `String(value)` must appear in the list.

All errors are collected before returning (no early exit after first error).
The function never throws.

### Server wiring — `apps/server/src/index.ts`

- **POST** handler: after `asObject()` and draft-default assignment, before
  duplicate-id check and DB insert, calls `validateFields(col.validate, body)`.
  If any errors are found, throws `ValidationError("Validation failed.", errs)`.
- **PUT** handler: after `asObject()` and existence check, before `updateRow`,
  calls `validateFields(col.validate, updateBody)`.
  Same `ValidationError` throw on failure.

Both handlers are short-circuited before touching the database.

### PUT validation policy

PUT is treated as a **full replace** for validation purposes: the same rules
apply as on POST. A `required` field that is absent from the PUT body produces
a required error, consistent with the full-replace semantic of PUT. This is
intentional and documented here. Partial-update (PATCH-style) semantics where
`required` is skipped for absent fields are not supported.

### Error response — `apps/server/src/errors.ts`

A `ValidationError` subclass of `EnbiError` carries the `details` array:

```typescript
class ValidationError extends EnbiError {
  readonly details: FieldError[];
  constructor(message: string, details: FieldError[]);
}
```

`errorHandler` checks `instanceof ValidationError` first and serializes:

```json
{
  "error": "validation",
  "message": "Validation failed.",
  "details": [
    { "field": "title", "message": "\"title\" is required." },
    { "field": "email", "message": "\"email\" must be a valid email." }
  ]
}
```

HTTP status: **422 Unprocessable Entity**.

### Admin UI — `apps/admin/src/pages/edit.astro`

- The `/api/admin_collections` metadata response now includes `validate` (the
  `Record<string, FieldRule>` from the collection config).
- `edit.astro` reads `col.validate[fieldName]?.required` and appends ` *` to
  the field label when true.
- No client-side validation is added; server responses remain authoritative.

## Consequences

- **Good:** structured, multi-error validation responses (422 + `details` array)
  replace opaque DB errors.
- **Good:** zero-cost for collections without `validate` rules — the fast-path
  checks `Object.keys(col.validate).length > 0` and skips the call entirely.
- **Good:** pure, synchronous `validateFields` is trivially unit-testable.
- **Good:** admin UI labels visually flag required fields for editors.
- **Bad:** validation runs in the application layer — DB constraints (NOT NULL,
  CHECK) still exist and may fire independently if bypassed.

## Non-goals

- **Cross-field rules** — e.g. "field A must equal field B" — are not addressed.
- **Async / uniqueness validation** — e.g. "value must not already exist in another
  row" — requires a DB call and is intentionally excluded from this synchronous layer.
- **Custom validators** — user-supplied functions are not supported; all rules
  are declarative and serialisable.
- **PATCH semantics** — partial-update where `required` is skipped for absent
  fields is not implemented.
