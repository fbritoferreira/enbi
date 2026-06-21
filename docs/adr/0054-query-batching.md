# ADR-0054 Query Batching for Relation Expand and i18n Overlay

**Status:** Accepted  
**Date:** 2026-06-22

## Context

The content list path in `@enbi/server` contained two N+1 query patterns:

1. **Relation expand**: for each expand field, the LIST handler iterated over `finalRows` and called `resolveExpanded` once per row — one `SELECT ... WHERE pk = ?` query per row.
2. **i18n overlay**: `overlayTranslations` iterated over rows and called `readTranslations` once per row — one `SELECT ... WHERE collection = ? AND entry_id = ? AND locale = ?` query per row.

Both patterns became O(n) queries for a list of n rows, degrading linearly with page size.

## Decision

### Shared gate helper

Extract the draft-and-scheduled public gating logic from `resolveExpanded` into a pure `gateExpandedRow` helper. The single-row GET `/:id` expand path continues to call `resolveExpanded`, which now delegates to `gateExpandedRow`. The LIST batch path calls `gateExpandedRow` directly after the batch fetch. Both paths share identical gating logic.

### Batch relation expand (LIST only)

For each expand field in the LIST handler: collect distinct non-null/non-empty FK values across `finalRows`, issue one `SELECT ... WHERE pk IN (?)` query via `getRowsByIds` (new export on `crud.ts` using drizzle `inArray`), build a `Map<fkValue, Row>`, then apply `gateExpandedRow` per row from the map. The single-row GET `/:id` path is unchanged.

### Batch i18n overlay

Add `readTranslationsBatch` to `i18n.ts`: one `SELECT ... WHERE collection = ? AND entry_id IN (?) AND locale = ?` query returning all translations for the batch. Rewrite `overlayTranslations` to call `readTranslationsBatch` once, build a `Map<entryId, translations>`, then apply per-row overlay from the map. `readTranslations` (single-entry) is unchanged and still used by GET `/:id`.

## Consequences

- **Performance:** O(n) queries reduced to O(1) per expand field and O(1) for the i18n overlay per list request.
- **Correctness:** Draft gate and scheduled gate behavior for public callers is identical to the previous implementation — both single and batch paths share `gateExpandedRow`.
- **API contract:** No observable change to response shape, status codes, or headers.
- **Empty input guard:** `getRowsByIds` and `readTranslationsBatch` short-circuit on empty input to avoid a degenerate `WHERE pk IN ()` query.
