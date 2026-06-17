# enbi — Auth e2e + `enbi keys` Design

Date: 2026-06-17
Status: Approved (build)

## Context

Auth is unit-tested (`can()`, `createAuth` boot, api-key provider) but the live flows
(signup/login/session, API-key, denied paths) have never run end-to-end. Now that `enbi migrate`
creates the auth tables, we can prove the full stack against a running server. We also need a way to
mint API keys (`enbi keys`).

### Decisions (brainstorm)

- **`enbi keys`** — `create` + `list` + `revoke`.
- **E2E** — Playwright, **API-only** (`request` fixture, no browser); flows: email/password
  signup+login+session, API-key, denied/expired paths. Social/SSO out (needs external IdP).
- **Server boot** — Playwright `webServer` runs the real CLI: `enbi migrate && enbi start`.
- **CI** — a **separate `e2e` job** in `ci.yml`.

## `@enbi/auth` — key management helpers

In `apikey.ts` (drizzle over `_api_keys`, unit-tested with vitest):

- `issueApiKey(db, table, { role, label?, now? })` → `{ id, key }`: generates a key, stores only its
  SHA-256 hash + `{ id, role, label, createdAt }`, returns the plaintext **once**.
- `listApiKeys(db, table)` → `{ id, role, label, createdAt }[]` (never the hash).
- `revokeApiKey(db, table, id)` → `boolean` (deleted?).

## `@enbi/cli` — `enbi keys <action> [id]`

`commands/keys.ts`, registered as cac `keys <action> [id]`:

- `create --role <r> --label <l>` → `issueApiKey`; print the key + id once; warn if `role` not in
  `config.roles`.
- `list` → table of id/role/label/created.
- `revoke <id>` → delete; report found/not-found.
  Loads config, `createDb`, calls the auth helpers. Typed `EnbiError`.

## Playwright e2e (root-level, standalone)

- `@playwright/test` (root devDep), `playwright.config.ts`: `testDir: "e2e"`, a single **non-browser**
  project (request only), `webServer.command` = `enbi migrate && enbi start --port 3787 --config e2e/enbi.config.ts`
  (built CLI), `url: http://localhost:3787/health`, `reuseExistingServer: !CI`.
- `e2e/enbi.config.ts` — fixture: sqlite **file** (`e2e/.tmp/e2e.db`), secret, roles
  `{ admin: "*", viewer: "read" }`, a `posts` collection (viewer-readable).
- `e2e/global-setup.ts` — mint an admin API key via `enbi keys create`, write it to a file/env for the spec.
- `e2e/auth.spec.ts` (request fixture; cookies persist per context):
  - **session:** `POST /api/auth/sign-up/email` → `POST /api/auth/sign-in/email` → `GET /api/posts` → 200.
  - **api-key:** present the minted key as `x-api-key` → gated route → role honored (admin can `POST /api/posts` → 201).
  - **denied:** wrong password → 401; create with no session (fresh context) → 401; viewer create → 403.

## CI — `e2e` job (`ci.yml`)

New job parallel to `verify`: harden-runner (audit) → checkout → `setup-vp` → `corepack enable` →
`vp install --frozen-lockfile` → `vp run -r build` → `pnpm exec playwright test`. **No browser
download** (API-only) so it stays within the egress allowlist; the only network is localhost.

## Modules / boundaries

`@enbi/auth/apikey.ts` (helpers + vitest tests) · `@enbi/cli/commands/keys.ts` + index wiring +
vitest test · root `playwright.config.ts` + `e2e/*` · `ci.yml` `e2e` job.

## Error handling

`EnbiError`: unknown role on `keys create` (warn, still create), missing key on `revoke` (report),
config/db errors surface as today. e2e asserts HTTP status codes for the denied paths.

## Testing

- vitest: `issueApiKey`/`listApiKey`/`revokeApiKey` (auth), `keys` command routing (cli) against sqlite `:memory:`.
- Playwright: the three live flows above against the real `enbi start` server.

## Out of scope

- Browser/UI e2e (arrives with the admin sub-project).
- Social/SSO live flows (external IdP).
- `enbi auth setup <provider>` (separate sub-project).

## Risks

- `webServer` sequencing `migrate && start` + port readiness — sqlite **file** shared across the two
  processes; Playwright waits on `/health`.
- better-auth signup/signin field names (`/api/auth/sign-up/email` body `{ email, password, name }`) —
  validated by the e2e run itself.

## Commit policy

Files written; PR created for this goal.
