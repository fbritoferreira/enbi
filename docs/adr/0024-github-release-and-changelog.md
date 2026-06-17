# 24. Each npm release also cuts a GitHub Release with a changelog

- Status: Accepted
- Date: 2026-06-17

## Context

Publishing to npm on merge (ADR-0023) leaves no human-facing record on GitHub — no tag, no release
notes, no changelog. Consumers and contributors expect a GitHub Release per version and a readable
history of what changed.

## Decision

When `release.yml` publishes at least one package, it then creates a GitHub Release for the repo-wide
version: tag `v<version>` on the merge commit, title `enbi v<version>`, with notes produced by
`gh release create --generate-notes` (auto-built from the pull requests merged since the previous
release). The step is guarded: it runs only when something was published and the tag does not already
exist, so it is idempotent. A hand-maintained `CHANGELOG.md` (Keep a Changelog) records curated
highlights; the auto-generated release notes cover the full PR list. The repo-wide version lives in
the root `package.json` (`0.1.0`), matching the lockstep `@enbi/*` versions (ADR-0023).

The publish job already has `id-token: write`; it gains `contents: write` to create the tag/release,
using the default `GITHUB_TOKEN` (no extra secret).

## Consequences

- **Good:** every npm release has a matching, linkable GitHub Release with an automatic changelog;
  curated `CHANGELOG.md` gives a readable summary; idempotent and version-gated like publish.
- **Cost:** the publish job needs `contents: write` (scoped to that job only); release notes quality
  depends on PR titles; the curated `CHANGELOG.md` is updated by hand per release.

## Alternatives considered

- **`softprops/action-gh-release` (SHA-pinned):** works, but `gh release create` is already on the
  runner and needs no extra pinned action. Chose the CLI.
- **Auto-generated notes only (no CHANGELOG.md):** less maintenance, but no curated summary. Kept
  both — generated notes for completeness, CHANGELOG.md for highlights.
- **`changesets` for versioning + changelog:** heavier; deferred (ADR-0023 already notes it as a
  possible future bump-automation layer).
