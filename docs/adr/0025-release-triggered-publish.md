# 25. npm publish is triggered by the GitHub Release event

- Status: Accepted
- Date: 2026-06-17
- Refines: ADR-0023, ADR-0024

## Context

ADR-0023/0024 had a single `release.yml` (on merge) both create the GitHub Release and publish to
npm. The owner wants publishing to happen **only after a release exists**, with a CI step that
listens for it — making the GitHub Release the explicit gate and npm publish a reaction to it.

## Decision

Split into two workflows:

- **`release.yml`** (push to default branch + manual dispatch): if the repo-wide version in the root
  `package.json` was bumped (tag `v<version>` doesn't exist yet), create the GitHub Release with
  `gh release create --generate-notes`. It does **not** touch npm.
- **`publish.yml`** (`on: release: types: [published]`): the listening step. It checks out the
  release's tag, builds/checks/tests, then publishes each not-yet-published `@enbi/*` package via
  OIDC trusted publishing, inside the human-gated `npm-publish` environment. Idempotent and
  version-gated.

So the order is: bump version → merge → release is created → publishing the release triggers
`publish.yml` → npm.

## Consequences

- **Good:** publishing only ever follows a real GitHub Release; the release is the auditable gate;
  publishing logic is isolated in one workflow with `id-token: write` and the environment approval.
- **GITHUB_TOKEN caveat:** a release created by the default `GITHUB_TOKEN` does **not** re-trigger
  workflows (GitHub loop-prevention), so it won't auto-fire `publish.yml`. Two supported paths:
  (a) set a `RELEASE_PAT` secret so `release.yml`'s release triggers publish automatically, or
  (b) publish the release from the GitHub UI (a human action), which triggers it. Documented in the
  workflow headers.
- **Cost:** two workflows instead of one; the PAT-vs-manual choice is an operational decision.

## Alternatives considered

- **Single workflow publishing on merge (ADR-0023 original):** no release gate, and no "listening"
  separation the owner asked for. Refined away.
- **Always use a PAT:** removes the manual step but adds a stored credential to guard. Offered as an
  option, not mandated.
