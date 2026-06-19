# 38. Content list endpoint gains query params, offset pagination, and equality filters

- Status: Accepted
- Date: 2026-06-20

## Context

The auto-generated `GET /api/<collection>` list endpoint previously returned every row in the
collection with no way to page through large result sets, control sort order, or narrow results to
a subset. Consumers had to retrieve all rows and filter client-side, which is neither scalable nor
appropriate for API-key-protected endpoints exposed over the network.

Two separate validation layers already exist in the server:

- A **global 422 handler** that catches body-validation failures from the route schema (used for
  `POST`/`PATCH` bodies).
- No analogous handler for query-string problems, which meant unknown or mis-typed query params
  previously silenced errors and returned unfiltered results.

## Decision

The list handler gains the following optional query parameters:

- `?limit=N` — page size, integer capped at 100 (defaults to all rows when omitted for
  backward compatibility).
- `?offset=N` — number of rows to skip before returning results; defaults to 0.
- `?sort=field` / `?sort=-field` — sort ascending or descending by the named column.
- `?<field>=value` — equality filter on any column present in the collection schema.

The response remains a **JSON array** (no envelope wrapper) to preserve backward compatibility with
existing consumers. The total row count after applying filters (but before `limit`/`offset`) is
surfaced in an **`X-Total-Count` response header** so clients can implement pagination controls
without a separate count request.

An unknown column name in `?sort=<field>` or `?<field>=value` returns **400** from a local catch
block inside the list handler. This is a deliberate split from the global 422 used for body
validation: 400 signals a bad query parameter (client-addressable without changing the request
body), while 422 signals a structurally invalid request entity. Mixing both into the global 422
handler would obscure this semantic distinction.

Pagination is **offset-based only**. Cursor/keyset pagination and OR-combined filters are out of
scope for this iteration; joins across collections are also excluded.

## Consequences

- **Good:** consumers can page through large collections without retrieving all rows.
- **Good:** the `X-Total-Count` header enables UI pagination without a separate count endpoint.
- **Good:** backward-compatible — a request with no query params behaves identically to before
  (full result set, no header constraint).
- **Good:** the 400/422 split is semantically correct and consistent with RFC 9110.
- **Limitation:** offset pagination degrades on very large offsets (full table scan up to the
  offset). Cursor pagination can be introduced in a later ADR without breaking this interface.
- **Limitation:** equality filters only — range queries, `LIKE`, and multi-column `OR` require a
  future query-language ADR.

## Alternatives considered

- **Envelope the response (`{ data: [], total: N }`):** cleaner than a header but breaks all
  existing consumers. Rejected in favour of `X-Total-Count` to maintain backward compatibility.
- **Merge query-param errors into the global 422 handler:** simpler code path but conflates two
  distinct error semantics. Rejected — the deliberate 400/422 split is worth the extra local catch.
- **Cursor pagination from the start:** more scalable at large offsets but requires a stable sort
  column and complicates the API surface. Deferred; offset pagination covers the immediate need.
- **GraphQL / OData query language:** comprehensive but far outside the current scope of enbi's
  REST-first design. Rejected for this iteration.
