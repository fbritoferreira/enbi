// @enbi/cli — `enbi dev`: sync schema, boot server + admin, restart on config change.
import { serve } from "@hono/node-server";
import { createDb } from "@enbi/db";
import { createServer } from "@enbi/server";
import { startAdminDev } from "../admin.ts";
import { loadConfig } from "../config.ts";
import { syncSchema } from "../sync.ts";

export type DevOptions = { cwd?: string; config?: string; port?: number; adminPort?: number };

export async function runDev(opts: DevOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);

  // Reuse this connection for the server so synced tables are visible (matters
  // for in-memory SQLite). Production uses `enbi migrate` instead (ADR-0028).
  const ctx = await createDb(config.db);
  const sync = await syncSchema(ctx, config);
  console.warn(`enbi: schema synced (${sync.statements.length} statement(s)).`);

  const app = await createServer(config, { db: ctx });
  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  console.warn(`enbi: dev server on :${port}`);

  // Admin is best-effort: dev still serves the API if the admin isn't installed.
  await startAdminDev(opts.adminPort).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`enbi: admin dev not started — ${message}`);
  });
}
