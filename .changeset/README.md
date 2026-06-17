# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). It records intended
version bumps and changelog entries.

To describe a change in a PR, run:

```bash
vp run changeset
```

Pick the affected packages and a bump type (patch/minor/major) and write a short summary. The file it
creates is committed with your PR. On merge to `main`, the release workflow opens a **Version Packages**
PR that applies the bumps and updates each package's `CHANGELOG.md`; merging that PR publishes to npm
(OIDC, no token) and cuts GitHub Releases. All `@enbi/*` packages are versioned in lockstep
(`fixed`). See `docs/adr/0026-changesets.md`.
