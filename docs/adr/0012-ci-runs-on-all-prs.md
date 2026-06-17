# 12. CI runs on every pull request, not only the main branch

- Status: Accepted
- Date: 2026-06-17

## Context

A pipeline that only runs on pushes to `main` validates code _after_ it has already merged — too
late to gate a PR. We want every change checked before it lands, on PRs targeting any base branch
(e.g. feature stacks, release branches), plus a fast feedback artifact for reviewers.

## Decision

`ci.yml` triggers on:

- `pull_request` (no branch filter → PRs against **any** base branch),
- `push` to `main` (post-merge safety net + main always-green signal),
- `workflow_dispatch` (manual re-runs).

It runs `vp install --frozen-lockfile`, `vp check`, `vp run -r test`, `vp run -r build`, then
uploads the built package/admin outputs as a PR artifact (7-day retention). Per-PR `concurrency`
cancels superseded runs. Publishing stays entirely in `release.yml` (tags only) — CI never
publishes (ADR-0008).

## Consequences

- **Good:** no change reaches `main` without passing checks; reviewers get downloadable build
  outputs; redundant runs are cancelled to save minutes.
- **Cost:** CI minutes on every push to every PR branch; the build artifact adds a little storage
  (bounded by retention).

## Alternatives considered

- **`push` to `main` only:** validates too late, after merge. Rejected.
- **`pull_request` restricted to `branches: [main]`:** misses PRs targeting release/feature bases.
  Rejected — the unfiltered `pull_request` trigger covers all bases.
