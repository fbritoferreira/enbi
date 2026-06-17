// @enbi/cli — drive the Astro admin via its programmatic API (ADR-0029).
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { EnbiError } from "@enbi/db";

type AstroApi = {
  dev: (opts: { root: string; server?: { port?: number } }) => Promise<unknown>;
  build: (opts: { root: string }) => Promise<unknown>;
};

function adminRoot(): string {
  const require = createRequire(import.meta.url);
  try {
    return dirname(require.resolve("@enbi/admin/package.json"));
  } catch {
    throw new EnbiError("config", "@enbi/admin is not installed.");
  }
}

async function loadAstro(): Promise<AstroApi> {
  try {
    return (await import("astro")) as unknown as AstroApi;
  } catch {
    throw new EnbiError("config", "astro is not installed — admin commands require it.");
  }
}

export async function startAdminDev(port?: number): Promise<void> {
  const astro = await loadAstro();
  await astro.dev({ root: adminRoot(), server: port ? { port } : undefined });
}

export async function buildAdmin(): Promise<void> {
  const astro = await loadAstro();
  await astro.build({ root: adminRoot() });
}
