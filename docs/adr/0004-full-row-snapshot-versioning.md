# 4. Content history via full row snapshots per save

- Status: Accepted
- Date: 2026-06-17

## Context

Full content history with versioning is the headline feature. Granularity options: full row
snapshot per save, field-level deltas, or snapshots plus a draft/publish state machine.

## Decision

Each save writes a **complete versioned copy** (full row snapshot) of the entry to a history table.
Restore = copy a snapshot forward; diff = compare two snapshots.

## Consequences

- **Good:** simple and robust; trivial restore and point-in-time read; diffing is comparing two
  whole rows; no fragile delta-reconstruction chain; easy to reason about across three SQL dialects
  (ADR-0003).
- **Cost:** more storage than deltas (mitigable later via compression/pruning/retention policy).
- Draft/publish state machine is **not** included now; it can be layered on later as its own ADR
  without changing the snapshot foundation.

## Alternatives considered

- **Field-level deltas:** compact but reconstruction + diff logic is complex and error-prone, and
  harder to keep correct across dialects. Rejected for v1.
- **Snapshots + draft/publish states:** richest option but more scope than the core history
  feature needs right now. Deferred.
