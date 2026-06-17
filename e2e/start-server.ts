// Playwright `webServer` launcher for the e2e suite. Boots the mock OIDC provider
// (when Docker is available), exports its discovery URL into THIS process's env,
// then launches the enbi CLI pipeline (generate → migrate → start) as children
// that inherit that env. The container MUST boot in the same process that spawns
// `enbi start`: Playwright does not guarantee `globalSetup` runs before
// `webServer`, so an SSO URL set in globalSetup never reached the server process
// (the cause of the `init 404` — the genericOAuth plugin was never registered).
// The SSO spec reads `e2e/.tmp/sso-ready.json` to decide whether to skip.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const PORT = process.env.PORT ?? "3787";
const ENBI = ["tools/cli/dist/bin/enbi.mjs", "--config", "e2e/enbi.config.ts"];
const IMAGE = "ghcr.io/navikt/mock-oauth2-server:2.1.10";
const ISSUER_ID = "default";

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("node", args, { stdio: "inherit", env: process.env });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited ${String(code)}`)),
    );
    p.on("error", reject);
  });
}

async function main(): Promise<void> {
  rmSync("e2e/.tmp", { recursive: true, force: true });
  rmSync("e2e/drizzle", { recursive: true, force: true });
  mkdirSync("e2e/.tmp", { recursive: true });

  let stop = async (): Promise<void> => {};
  let ready = false;
  try {
    const { GenericContainer, Wait } = await import("testcontainers");
    const container = await new GenericContainer(IMAGE)
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp(`/${ISSUER_ID}/.well-known/openid-configuration`, 8080))
      .withStartupTimeout(120_000)
      .start();
    const base = `http://${container.getHost()}:${container.getMappedPort(8080)}/${ISSUER_ID}`;
    process.env.ENBI_E2E_SSO_ISSUER = base;
    process.env.ENBI_E2E_SSO_DISCOVERY = `${base}/.well-known/openid-configuration`;
    ready = true;
    stop = async () => {
      await container.stop();
    };
  } catch (error) {
    // No Docker (Podman locally) — boot the server without SSO; the spec skips.
    console.warn(`SSO e2e: mock IdP unavailable, SSO spec will skip: ${String(error)}`);
  }
  writeFileSync("e2e/.tmp/sso-ready.json", JSON.stringify({ ready }));

  let server: ChildProcess | undefined;
  const shutdown = (): void => {
    server?.kill("SIGTERM");
    void stop().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Now that env carries the SSO discovery URL, the CLI's generated config
  // registers the genericOAuth provider for both migrate and start.
  await run([...ENBI, "generate"]);
  await run([...ENBI, "migrate"]);

  // Foreground server: this process stays alive as Playwright's webServer.
  server = spawn("node", [...ENBI, "start", "--port", PORT], {
    stdio: "inherit",
    env: process.env,
  });
  server.on("exit", (code) => {
    void stop().finally(() => process.exit(code ?? 0));
  });
}

void main();
