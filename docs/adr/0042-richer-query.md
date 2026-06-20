# 42. Richer query: filter operators, match mode, and keyset cursor pagination

- Status: Accepted
- Date: 2026-06-20

## Context

The list endpoint `GET /api/<collection>` previously supported only equality filters
(`?field=value`), offset/limit pagination, and a single sort parameter. As collections grow,
consumers increasingly need:

- **Range and substring filtering** — "give me posts with more than 100 views" or "titles containing
  a keyword" — neither of which can be expressed with equality alone.
- **OR-combined filters** — matching entries that satisfy _any_ of several conditions rather than
  _all_ of them.
- **Efficient deep pagination** — offset-based pagination requires the database to scan and discard
  all preceding rows. Beyond a few thousand rows this becomes noticeably slow. Keyset (cursor)
  pagination avoids that by anchoring the query to a known primary-key position.

Offset pagination and simple equality filters are not removed; backward compatibility with existing
API consumers is a hard requirement.

## Decision

### Operator suffix convention (`field__op`)

Filter query parameters may now carry an operator suffix separated by a double-underscore (`__`):

```
?views__gte=100        # views >= 100
?title__like=hello     # title LIKE '%hello%'
?id__in=p1,p2,p3      # id IN ('p1','p2','p3')
?title=hello           # unchanged — still means title = 'hello'
```

Splitting on the **last** `__` in the key means column names that themselves contain underscores
(e.g. `created_at`) work correctly: `?created_at__gte=2026-01-01`.

The supported operator set is:

| Suffix | SQL equivalent                     |
| ------ | ---------------------------------- |
| `eq`   | `= value` (default when no suffix) |
| `ne`   | `!= value`                         |
| `like` | `LIKE '%value%'`                   |
| `gt`   | `> value`                          |
| `gte`  | `>= value`                         |
| `lt`   | `< value`                          |
| `lte`  | `<= value`                         |
| `in`   | `IN (value.split(","))`            |

An unknown suffix returns **400** via the same local catch that already handles unknown column
names.

### `_match=any` for OR semantics

The reserved query parameter `_match=any` switches filter combination from `AND` (the default) to
`OR`:

```
?title__like=foo&views__gte=100&_match=any
# title LIKE '%foo%' OR views >= 100
```

The default (`_match=all` or parameter absent) is AND, matching the previous behaviour.

### Keyset cursor pagination with `X-Next-Cursor`

The reserved query parameter `cursor=<pk>` switches the list handler to keyset mode. When present:

1. A `WHERE pk > cursor` clause is added to the filter predicate (AND-combined with any filters).
2. Results are ordered by the primary key ascending (sort parameter is ignored in cursor mode).
3. Limit is still applied.

After fetching, if the response is a **full page** (i.e. `rows.length === limit`) the server sets
`X-Next-Cursor` to the last row's primary-key value. The caller passes this value as `cursor=` on
the next request. When the final (partial) page is returned the header is absent, signalling the
end of the dataset.

`X-Total-Count` is still set in cursor mode, counting rows that satisfy the filters (but not the
cursor bound, so it reflects the full matching set rather than remaining rows).

Offset pagination continues to work unchanged when `cursor` is absent.

### Internal types

`ListFilter` becomes `{ column: string; op: FilterOp; value: string }` where
`FilterOp = "eq" | "ne" | "like" | "gt" | "gte" | "lt" | "lte" | "in"`.

`ListOptions` gains `match?: "all" | "any"`, `cursor?: string`, and `primaryKey?: string` (the
route passes `col.primaryKey`; callers of the lower-level `listRows` that want cursor mode must
supply it).

`countRows` gains an optional `match` parameter to mirror `listRows`; count always ignores
cursor/limit/offset.

## Consequences

- **Good:** consumers can express the most common filter patterns (range, substring, set membership)
  without a custom query layer.
- **Good:** `_match=any` unlocks OR semantics while keeping the common AND case as the default.
- **Good:** keyset pagination scales to arbitrarily large collections without degrading over time.
- **Good:** the `field__op` convention is unambiguous, easy to generate from any HTTP client, and
  does not require a query DSL or JSON body.
- **Good:** backward compatibility is preserved — `?field=value` (no suffix) continues to mean
  equality, the response shape is unchanged (bare JSON array), and `X-Total-Count` is still set.
- **Operational:** cursor mode orders by primary key ascending. Consumers that need a different sort
  order in cursor mode cannot use the `sort` parameter simultaneously — this is a known limitation.
- **API surface:** `FilterOp`, `ListFilter`, and `ListOptions` are updated in `@enbi/server`'s
  internal `crud.ts`. `listRows` and `countRows` signatures are updated in a backward-compatible
  way (new optional fields on existing parameters).

## Alternatives considered

- **Structured JSON filter body on GET:** expressive but non-standard (GET with a body), breaks
  caching, and is awkward to construct from forms or plain URLs. Rejected in favour of query
  parameters.
- **Separate `/search` endpoint:** avoids complicating the list endpoint but duplicates pagination
  and auth logic, and splits the API surface unnecessarily. Rejected.
- **Cross-field OR groups (e.g. `_or[0][title]=foo&_or[0][views]=1`):** adds significant parsing
  complexity for a rare use case. Not in scope — the flat `_match=any` covers the most common OR
  pattern.
- **Multi-column cursor:** required for stable pagination with non-unique sort keys. Deferred; the
  current implementation requires the primary key as the sole cursor column.
- **Full-text search:** a separate concern (requires FTS indexes, ranking). Not in scope.
