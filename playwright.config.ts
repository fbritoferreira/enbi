import { defineConfig } from "@playwright/test";

const PORT = 3787;
const BASE = `http://localhost:${PORT}`;
const ENBI = "node tools/cli/dist/bin/enbi.mjs --config e2e/enbi.config.ts";

// API-level e2e (no browser): boot the real built CLI (migrate then start) and
// hit it over HTTP with the `request` fixture (ADR-0032).
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  // Send Origin so better-auth's CSRF check passes (it matches the configured baseURL).
  use: { baseURL: BASE, extraHTTPHeaders: { origin: BASE } },
  projects: [{ name: "api" }],
  webServer: {
    // Full real flow on a clean db each run: generate migrations → apply → start.
    command:
      `rm -rf e2e/.tmp e2e/drizzle && mkdir -p e2e/.tmp && ` +
      `${ENBI} generate && ${ENBI} migrate && ${ENBI} start --port ${PORT}`,
    url: `${BASE}/health`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
