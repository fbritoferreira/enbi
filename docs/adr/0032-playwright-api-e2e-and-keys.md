# 32. Playwright API-level e2e (in CI) + `enbi keys`

- Status: Accepted
- Date: 2026-06-17

## Context

Auth has unit coverage but no end-to-end proof that signup/login/session and API-key auth work
against a real running server. There is also no way to mint API keys. We want live e2e that runs on
every PR, and a `keys` command.

## Decision

- **`enbi keys`** (`create`/`list`/`revoke`) backed by `@enbi/auth` helpers (`issueApiKey`,
  `listApiKeys`, `revokeApiKey`) over `_api_keys` — only the key hash is stored; the plaintext is
  printed once on create.
- **Playwright** for e2e, used **API-only** (the `request` fixture / `APIRequestContext`, no
  browser) since there is no admin UI yet. Playwright's `webServer` boots the **real built CLI**
  (`enbi migrate && enbi start`) against a fixture sqlite config, so the tests exercise the shipped
  binary black-box over HTTP.
- A **separate `e2e` job** in `ci.yml` runs `playwright test` on every PR (after build). No browser
  is downloaded, so it stays inside the egress allowlist (only localhost traffic).

## Consequences

- **Good:** real proof of the auth stack through the published CLI on every PR; `keys` gives API-key
  management; API-only keeps CI light and within the hardening posture; the e2e check is isolated.
- **Cost:** a second test runner (Playwright) alongside vitest, and a new CI job (longer total CI).
  Browser/UI e2e is deferred to the admin sub-project (will add a browser project + Chromium install).

## Alternatives considered

- **In-process `app.request` e2e (vitest):** simpler, but tests the lib, not the shipped server/CLI,
  and isn't a true e2e. Rejected in favor of a live server.
- **Full Playwright with Chromium now:** heavier CI (browser download + egress) with nothing to click
  yet. Deferred to the admin UI.
- **Append e2e to the verify job:** fewer jobs but mixed logs and a longer single job. Rejected for a
  dedicated `e2e` job.
