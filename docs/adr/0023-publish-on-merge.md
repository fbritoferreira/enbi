# 23. Publish to npm on merge to the default branch

- Status: Accepted
- Date: 2026-06-17

## Context

ADR-0008 set up tag-triggered OIDC publishing in dry-run. The owner wants merging to main/master to
publish a new package version, rather than cutting a tag by hand.

## Decision

`release.yml` triggers on push to `main`/`master` (plus `v*` tags and manual dispatch). The publish
step is **idempotent and version-gated**: for each public `@enbi/*` package it checks
`npm view <name>@<version>`; if that exact version is already on npm it skips, otherwise it
publishes via OIDC trusted publishing (`--provenance --access public`, no `NPM_TOKEN`).

Releasing a package therefore means **bumping its version in a PR**; merging that PR publishes the
new version. Merges that don't change a version publish nothing. The first cut is `0.1.0`.

## Consequences

- **Good:** "merge → publish" with no manual tagging; safe re-runs (no accidental republish errors);
  per-package granularity (only bumped packages publish); provenance on every release.
- **Cost:** version bumping is manual (a `changesets`-style automation can layer on later); requires
  the one-time npm trusted-publisher config + `npm-publish` GitHub environment (ADR-0008) before the
  first real publish succeeds — until then the publish step fails by design (nothing is mis-published).
- Egress is in audit mode pending the block switch (ADR-0013).

## Alternatives considered

- **Tag-only releases:** manual tagging per release; the owner explicitly wanted merge-driven. Kept
  as an additional trigger, not the primary one.
- **Always publish (no version guard):** re-merges would fail on "version exists". Rejected.
- **Auto-increment version in CI:** surprising, needs a commit-back with write scope; deferred in
  favor of explicit bumps (optionally `changesets` later).
