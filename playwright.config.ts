import { defineConfig, devices } from "@playwright/test";

const PORT = 3787;
const BASE = `http://localhost:${PORT}`;

// API-level e2e (no browser): boot the real built CLI and hit it over HTTP with
// the `request` fixture (ADR-0032). The `sso` project adds a chromium browser to
// walk a real genericOAuth login against a mock OIDC provider (ADR-0036). The mock
// container is booted by the webServer launcher (`e2e/start-server.ts`) — NOT a
// globalSetup — so the SSO discovery URL lands in the same process that spawns
// `enbi start` and the genericOAuth plugin is actually registered.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  // Send Origin so better-auth's CSRF check passes (it matches the configured baseURL).
  use: { baseURL: BASE, extraHTTPHeaders: { origin: BASE } },
  // `admin` runs FIRST: all e2e projects share one server + db (workers:1,
  // sequential), and the first-ever signup becomes the bootstrap admin (ADR-0034).
  // The admin UI flow needs an admin-role session (read metadata + content CRUD),
  // so its signup must be the first one. The api/sso projects create their own
  // unique (non-first → default-role) users afterward and are order-independent.
  projects: [
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4321" },
    },
    { name: "api", testIgnore: /sso\.spec\.ts|admin\.spec\.ts/ },
    { name: "sso", testMatch: /sso\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // The launcher boots the mock OIDC container (when Docker exists), then runs
    // generate → migrate → start with the SSO discovery URL in its env.
    command: `node e2e/start-server.ts`,
    url: `${BASE}/health`,
    // Generous: the launcher may pull and boot the mock OIDC container first.
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
