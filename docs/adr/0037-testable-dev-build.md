# 37. Testable dev/build handles and real-artifact assertion

- Status: Accepted
- Date: 2026-06-18

## Context

`enbi dev` orchestrates two servers — the core HTTP API (`serve()`) and the admin UI (an Astro dev
server) — but neither path was covered by tests. Concretely:

- `serve()` never returned a handle, so tests could not read the ephemeral port or stop the server
  without a global teardown hack.
- `startAdminDev()` had no return value, so the "admin started alongside API" path and the "admin
  failed → API-only degradation" path were both untested.
- `enbi build` emitted `apps/admin/dist/index.html`, but the test suite only asserted that the
  build command exited without error — it never verified that the artifact was actually produced
  and non-empty.

The absence of handles also made teardown fragile: tests that started servers had to rely on
process-level tricks rather than explicit `.close()` / `.stop()` calls, leading to keep-alive
connections that could hang the test runner.

## Decision

Introduce **closable handles** at every level of the dev stack and a **real-artifact assertion**
for the build path:

- `startAdminDev(port?)` now returns `AdminHandle = { url?: string; stop: () => Promise<void> }`,
  wrapping the Astro dev server object. It reads `dev.address.port` to surface the bound URL and
  calls `dev.stop()` on teardown.
- `runDev(opts?, deps?)` now returns `DevHandle = { url: string; admin: AdminHandle | null; close: () => Promise<void> }`.
  `close()` calls `server.closeAllConnections?.()` before `server.close()` so keep-alive connections
  do not block test teardown.
- A **dependency-injection seam** (`deps.startAdmin`) is added to `runDev`. In tests, a fake
  implementation is passed so the admin-failure degradation path can be exercised without spawning a
  real Astro process.
- Three new tests are added to `tools/cli/tests/index.test.ts`:
  1. **dev-serves-API-and-admin-together** — starts dev with a real admin stub and asserts both
     handles are reachable.
  2. **dev-degrades-to-API-only-when-admin-fails** — injects a failing `startAdmin`, asserts
     `admin` is `null` and the API handle is still live.
  3. **enbi-build-emits-a-real-artifact** — runs `enbi build` and asserts
     `apps/admin/dist/index.html` exists and is non-empty (replaces the old "built or typed error"
     smoke test).
- `@enbi/admin` is added as a `devDependency` of `tools/cli` (workspace symlink). It is required
  only for the build test and is not exposed to published consumers.

## Consequences

- **Good:** `enbi dev` and `startAdminDev` are now programmatically controllable — integration
  tests can start and stop the full stack without leaking processes or relying on OS-level cleanup.
- **Good:** the build path is verified against a real artifact, not just an exit code.
- **Good:** teardown is deterministic — `closeAllConnections` drains keep-alive sockets so the test
  runner exits cleanly.
- **Cost:** the build test boots a real Astro process to produce `dist/index.html`. This is
  inherently slower than a unit test; the suite timeout is raised to 120 s to accommodate it.
- **No runtime change:** the new return values are additive. The existing `enbi dev` and
  `enbi build` CLI commands behave identically to end users.

## Alternatives considered

- **Mock the HTTP server entirely:** avoids the need for handles but gives no confidence that the
  real `serve()` binds correctly on an ephemeral port. Rejected — the ephemeral-port read is
  exactly the behavior we need to trust.
- **Use a `globalSetup` / `globalTeardown` pair:** could stop servers after the whole suite, but
  keep-alive connections from one test would still block others within the same run. Per-test
  handles with `closeAllConnections` are cleaner.
- **Stub the Astro build in the artifact test:** would make the test fast but would not catch
  regressions where the Astro config silently stops emitting `index.html`. The real build is kept
  despite the cost.
