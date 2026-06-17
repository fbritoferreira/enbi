# 36. SSO e2e against a mock OIDC provider

- Status: Accepted
- Date: 2026-06-18

## Context

enbi exposes single-sign-on through better-auth's `genericOAuth` plugin, configured via
`auth.ssoProviders` (ADR-0005). Only the wiring was unit-tested — that the plugin is added when
`ssoProviders` is non-empty. No test drove a real OAuth2/OIDC authorization-code flow to a
logged-in session, so the headline "SSO" feature was unverified end to end.

The fixed social providers (`auth.social.github` / `google`) use better-auth's hardcoded provider
endpoints and cannot be repointed at a mock without patching better-auth, so they remain
config-only. The realistically testable SSO surface is `genericOAuth`.

## Decision

Add a **browser e2e** test (`e2e/sso.spec.ts`, a chromium Playwright project) that drives a full
`genericOAuth` authorization-code login against a **mock OIDC provider** —
`ghcr.io/navikt/mock-oauth2-server`, run in a **testcontainer**. The container is booted by the
Playwright **webServer launcher** (`e2e/start-server.ts`) — NOT a `globalSetup` — because Playwright
does not guarantee `globalSetup` runs before `webServer`, so a discovery URL set in globalSetup never
reached the server process (the genericOAuth plugin went unregistered → `init 404`). The launcher
sets the discovery URL in its own env, then spawns `enbi generate/migrate/start`; `e2e/enbi.config.ts`
reads that env into an `ssoProviders` entry, and the spec reads an `e2e/.tmp/sso-ready.json` marker to
decide whether to skip. The test initiates sign-in via the core `/sign-in/social` route with
`provider: <providerId>` (better-auth's genericOAuth registers no dedicated endpoint in 1.7.0-beta.6),
keeps PKCE/state cookies in the browser context, walks the mock login, lands on the callback, and
asserts a user was created with a live session. Scope is **one happy-path SSO login**. The
first-user→`admin` bootstrap (ADR-0034) is NOT asserted here: the e2e server shares its db with the
`api` specs (which create users first), so the SSO user is not the first user; bootstrap is covered
by the `@enbi/cli` unit test, which isolates a fresh db.

Docker-only: if the container can't start (e.g. Podman locally), the spec **skips** rather than
fails — the same constraint as the cross-dialect suite (ADR-0035). It runs un-skipped on CI.

## Consequences

- **Good:** the `genericOAuth` SSO path is verified end to end on a real OIDC server — sign-in,
  the OAuth callback, user creation, and session establishment.
- **Cost:** the CI `e2e` job now installs a chromium browser (`playwright install --with-deps
chromium`) and pulls a container image; new endpoints (`ghcr.io`, the GitHub container registry,
  and the Playwright browser CDN) are recorded in the egress allowlist for the ADR-0013 block flip.
  `testcontainers` becomes a root dev dependency.
- **Podman caveat:** as with ADR-0035, the mock can't be exercised locally under Podman (log/HTTP
  readiness fails), so the SSO spec is verified on **CI** (real Docker) and skips locally. The mock
  image is version-pinned because its login-page and claim contract is version-sensitive.

## Alternatives considered

- **Integration test with `fetch` (no browser):** lighter and keeps browser-CI deferred, but depends
  on the mock auto-issuing a code rather than rendering an interactive login page — unverifiable
  locally under Podman. The browser handles whatever the mock presents, so it was chosen for
  robustness.
- **Mock as a CI service container + env gate:** no local parity and no clean skip path; testcontainers
  matches the existing cross-dialect approach. Not chosen.
- **Test `social.github` / `google` live:** impossible to mock without patching better-auth's
  hardcoded endpoints. Out of scope.
