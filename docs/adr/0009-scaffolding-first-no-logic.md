# 9. First deliverable is scaffolding only, no business logic

- Status: Accepted
- Date: 2026-06-17

## Context

enbi spans six subsystems. Shipping them together would be an unreviewable change. The project
follows a rule: a new package's first PR contains only scaffolding (build config, tsconfig, tests,
empty placeholder export) — no business logic — with custom code in follow-up PRs.

## Decision

The first deliverable scaffolds all six packages (wiring, tooling, placeholder exports, CI,
cleanup of template leftovers) and proves the monorepo is green locally. **No versioning, auth, db,
API, admin, or CLI logic.** Each subsystem gets its own later spec → plan → PR.

## Consequences

- **Good:** small reviewable diff; the toolchain, dependency graph, and secure publishing pipeline
  are validated before any logic exists; later PRs stay focused.
- **Cost:** several PRs before the CMS does anything user-visible. Accepted deliberately.

## Alternatives considered

- **Build a vertical slice (one type end-to-end) first:** more impressive demo but couples six
  unfinished subsystems in one diff. Rejected for reviewability.
