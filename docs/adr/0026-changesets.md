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
- `release.yml` (push to `main`) runs `changesets/action` (SHA-pinned) for the **Version Packages**
  PR only (bumps + per-package `CHANGELOG.md` via `@changesets/changelog-github`). When no changesets
  are pending (`hasChangesets == false`), a follow-up step **publishes with `pnpm publish -r`**, then
  `pnpm exec changeset tag` + `gh release create` to tag and cut **GitHub Releases**. All in one job,
  so no cross-workflow trigger / `GITHUB_TOKEN` retrigger problem.
- **Publishing uses pnpm, not `changeset publish`.** `changeset publish` shells out to `npm`, and
  this repo's root `devEngines.packageManager: pnpm` makes npm abort with `EBADDEVENGINES`
  ("Invalid name pnpm does not match npm"). `pnpm publish -r` honors the pnpm guard and is pnpm's
  own recommended flow (pnpm.io/using-changesets). This was a real CI failure on the first release.
- All `@enbi/*` packages are versioned in lockstep (`fixed` group), `access: public`.
- **OIDC trusted publishing**: the job has `id-token: write`, sets `NPM_CONFIG_PROVENANCE=true`, and
  stores **no `NPM_TOKEN`** (the action logged "OIDC is available - using npm trusted publishing").
  Runs inside the human-gated `npm-publish` environment (ADR-0008). Note: OIDC support via
  `pnpm publish` should be confirmed on the first real publish; if unsupported by the pinned pnpm,
  fall back to a short-lived token or `changeset publish` with `devEngines` relaxed.

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
