# 26. Use changesets for versioning, changelogs, releases, and OIDC publish

- Status: Accepted
- Date: 2026-06-17
- Supersedes the release mechanism of: ADR-0023, ADR-0024, ADR-0025

## Context

ADR-0023→0025 hand-rolled merge-driven publishing, a version-bump guard, GitHub Releases, and a
release→publish split. That split hit GitHub's `GITHUB_TOKEN` loop-prevention (an automated release
won't trigger a separate publish workflow) and required manual version bumps + a hand-kept
CHANGELOG. [changesets](https://github.com/changesets/changesets) is the standard monorepo tool that
solves all of this in one workflow.

## Decision

Adopt changesets:

- Contributors run `vp run changeset` to record a bump (patch/minor/major) + summary; the file is
  committed with the PR.
- `release.yml` (push to `main`) runs `changesets/action` (SHA-pinned): if changesets are pending it
  opens/updates a **Version Packages** PR (applies bumps, writes per-package `CHANGELOG.md` via
  `@changesets/changelog-github`); when none are pending it runs `changeset publish` → publishes
  changed packages and creates **GitHub Releases**. All in one job, so no cross-workflow trigger and
  no `GITHUB_TOKEN` retrigger problem.
- All `@enbi/*` packages are versioned in lockstep (`fixed` group), `access: public`.
- **Publishing uses npm OIDC trusted publishing**: the job has `id-token: write`, sets
  `NPM_CONFIG_PROVENANCE=true`, and stores **no `NPM_TOKEN`**. `changeset publish` shells out to
  `npm publish`, which performs the OIDC handshake when the registry has a trusted publisher
  configured for this workflow. Runs inside the human-gated `npm-publish` environment (ADR-0008).

`publish.yml` and the root `CHANGELOG.md` are removed; changesets owns both.

## Consequences

- **Good:** standard, low-maintenance flow; automatic per-package changelogs and GitHub Releases;
  version bumps are explicit (changeset files) and reviewable as a Version PR; one workflow, no
  retrigger gymnastics; OIDC keeps publishing tokenless.
- **Cost:** contributors must add a changeset per user-facing change (CI can later enforce this with
  the changesets bot/status); `changeset publish` uses the workspace package manager — OIDC trusted
  publishing must be validated on the first real release, and the npm trusted publisher must point at
  `release.yml` + env `npm-publish`.

## Alternatives considered

- **Hand-rolled release/publish (ADR-0023–0025):** works but reinvents changesets and tripped on the
  token retrigger limit. Superseded.
- **semantic-release:** commit-message-driven; powerful but more magic and less suited to lockstep
  monorepo review than changesets' explicit Version PR. Not chosen.
