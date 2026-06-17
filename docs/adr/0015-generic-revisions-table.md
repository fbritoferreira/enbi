# 15. Snapshots live in one generic `_revisions` table

- Status: Accepted
- Date: 2026-06-17

## Context

ADR-0004 stores a full row snapshot per save. Storage options: one shared `_revisions` table with a
JSON snapshot column, or a parallel shadow table per content type mirroring its columns.

## Decision

A single `_revisions` table:
`(id, collection, entryId, version, snapshot, authorId, createdAt)`. `snapshot` is a dialect-aware
JSON column — `jsonb` (Postgres), `json` (MySQL), `text` (SQLite). `version` increments per
`(collection, entryId)`.

## Consequences

- **Good:** one place to query/restore history regardless of content type; no per-collection
  migration churn; trivially portable across the three dialects; adding a collection needs no new
  history table.
- **Cost:** snapshot is opaque JSON — not column-queryable; field-level history queries would need
  JSON extraction. Acceptable for restore/diff use cases.

## Alternatives considered

- **Shadow table per collection:** typed, per-field queryable, but multiplies tables and migration
  complexity across three dialects and couples history schema to content schema. Rejected for v1.
