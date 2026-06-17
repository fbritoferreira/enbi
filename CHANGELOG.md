# Changelog

All notable changes to enbi are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project uses a single repo-wide version
across all `@enbi/*` packages (ADR-0023). On merge to the default branch, each package whose version
is not yet on npm is published, and a matching GitHub Release `v<version>` is created with notes
generated from the merged pull requests (ADR-0024).

## [Unreleased]

## [0.1.0] - 2026-06-17

### Added

- `@enbi/db` — `defineEnbiConfig`, `createDb` (SQLite/Postgres/MySQL), `collection()` wrapper
  (preserves user Drizzle indexes/constraints), generic `_revisions` and `_api_keys` tables,
  `buildSchema`.
- `@enbi/core` — full row-snapshot versioning: `writeRevision`, `listRevisions`, `getRevision`,
  `restoreRevision`.
- `@enbi/auth` — better-auth (1.7.0-beta.6) email/password, social, SSO via `genericOAuth`,
  admin/roles; pure `can()` RBAC; native API keys; `public` role.
- `@enbi/server` — auto-REST per collection with auth gating, versioning, and public-action bypass.
- Project: GPL-2.0-only license, CLA enforced in CI, PR CI pipeline, and publish-on-merge to npm.

[Unreleased]: https://github.com/fbritoferreira/enbi/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/fbritoferreira/enbi/releases/tag/v0.1.0
