# 22. Require a signed CLA, enforced in CI

- Status: Accepted
- Date: 2026-06-17

## Context

Under GPL-2.0 (ADR-0021) the project still wants explicit, recorded permission from each contributor
to license their contributions under the project terms (and to relicense/enforce). A Contributor
License Agreement, checked automatically, provides that record.

## Decision

Add a CLA (`/CLA.md`) and enforce it with the pinned `contributor-assistant/github-action`
(`cla.yml`). On each PR the action sets a commit status that stays failing until every contributor
comments the sign-off phrase; signatures are stored in-repo at `.github/cla/signatures.json`. Bots
are allowlisted. The job uses least-privilege write scopes (contents/PR/statuses/actions) and the
action is SHA-pinned (ADR-0008 discipline).

## Consequences

- **Good:** every contribution is covered by an auditable agreement; merge is blocked until signed;
  no external service — signatures live in the repo.
- **Cost:** `cla.yml` runs on `pull_request_target` + `issue_comment` (needed so a comment can
  trigger the re-check and so the job has write access to record signatures). `pull_request_target`
  carries write permissions, so the job must never check out or execute PR-contributed code — it
  only records signatures, which the pinned action does.
- First-time contributors must add a comment before their PR can merge.

## Alternatives considered

- **DCO (`Signed-off-by`) instead of a CLA:** lighter weight, but a weaker grant than a CLA and not
  what the owner asked for. Not chosen.
- **No agreement:** relies solely on the inbound=outbound GPL assumption; weaker provenance.
  Rejected.
- **External CLA SaaS (cla-assistant.io):** third-party data dependency; the self-hosted action
  keeps signatures in-repo. Rejected.
