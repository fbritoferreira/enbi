# 8. Publish via npm Trusted Publishing (OIDC) with hardened CI/CD

- Status: Accepted
- Date: 2026-06-17

## Context

We must publish `@enbi/*` from GitHub Actions. The npm ecosystem suffered self-propagating
supply-chain worms in 2025 — **Shai-Hulud** (Sept 2025) and **Shai-Hulud 2.0** (Nov/Dec 2025) —
which steal long-lived npm tokens, GitHub PATs, and cloud credentials from CI via dependency
`postinstall` scripts, then republish compromised versions using the stolen tokens. A stored
`NPM_TOKEN` in CI is exactly the asset they harvest. npm **Trusted Publishing via OIDC** went GA
2025-07-31, removing the need for any stored token.

## Decision

Publish with **npm Trusted Publishing (OIDC)** — no `NPM_TOKEN` is ever stored. Split CI into:

- `ci.yml` (push/PR): install + check + test + build. No secrets, no `id-token`, `contents: read`.
- `release.yml` (release/`v*` tag on default branch only): the only job with `id-token: write`;
  publishes via OIDC; provenance auto-generated.

Hardening (all mandatory):

- Least-privilege `permissions` per job; `id-token: write` only on the publish job.
- npm trusted-publisher config per package (org `enbi`, repo, `release.yml`, env `npm-publish`).
- GitHub Environment `npm-publish` with required-reviewer protection.
- All actions pinned to full commit SHAs (not tags); updated via Renovate/Dependabot.
- `step-security/harden-runner` in `egress-policy: block` with an explicit allowlist.
- Dependency lifecycle scripts disabled in CI (`pnpm.onlyBuiltDependencies` allowlist,
  `--frozen-lockfile`).
- Cloud-hosted runners only (required for OIDC; no ambient self-hosted creds).
- Publish job never checks out or runs untrusted PR code.
- `concurrency` guard against double-publish.
- Phishing-resistant MFA on npm org and maintainer GitHub accounts (operational, documented).

The scaffolding PR lands both workflows with `release.yml` in `npm publish --dry-run` mode.

## Consequences

- **Good:** removes the stored-credential the worm family steals; provenance attestations prove
  build origin; blast radius of a compromised dep is contained by egress block + script disabling +
  human-gated environment.
- **Cost:** public repo required for provenance; cloud runners only; one-time manual
  trusted-publisher setup in the npm UI per package; SHA-pinning needs bot-driven updates.

## Alternatives considered

- **Stored `NPM_TOKEN` secret / automation token:** the exact attack surface of 2025's worms.
  Rejected.
- **Granular short-lived PAT instead of OIDC:** still a stealable secret and more moving parts.
  Rejected in favor of OIDC.

## Operational setup (one-time, manual)

1. For each `@enbi/*` package on npmjs.com → package **Settings → Trusted Publisher**, add:
   GitHub org `enbi`, this repository, workflow file `release.yml`, environment `npm-publish`.
2. In GitHub → repo **Settings → Environments**, create `npm-publish` with **required reviewers**
   so every release is human-approved.
3. Keep the repository **public** (provenance attestations require it).
4. Enforce **phishing-resistant MFA** on the npm `enbi` org and on maintainer GitHub accounts;
   do not create classic long-lived PATs.
5. The `release.yml` publish step stays `--dry-run` until step 1 is done for a package; flip it off
   in that package's first real release.
