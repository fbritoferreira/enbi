// @enbi/cli — `enbi dev`: sync schema, boot server + admin, return a closable handle.
import { serve } from "@hono/node-server";
import { createDb } from "@enbi/db";
import { createServer } from "@enbi/server";
import { type AdminHandle, startAdminDev } from "../admin.ts";
import { loadConfig } from "../config.ts";
import { syncSchema } from "../sync.ts";

export type DevOptions = { cwd?: string; config?: string; port?: number; adminPort?: number };
/** Test seam: override how the admin dev server starts (defaults to startAdminDev). */
export type DevDeps = { startAdmin?: (port?: number) => Promise<AdminHandle> };
export type DevHandle = { url: string; admin: AdminHandle | null; close: () => Promise<void> };

export async function runDev(opts: DevOptions = {}, deps: DevDeps = {}): Promise<DevHandle> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);

  // Reuse this connection for the server so synced tables are visible (matters
  // for in-memory SQLite). Production uses `enbi migrate` instead (ADR-0028).
  const ctx = await createDb(config.db);
  const sync = await syncSchema(ctx, config);
  console.warn(`enbi: schema synced (${sync.statements.length} statement(s)).`);

  const app = await createServer(config, { db: ctx });
  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  // serve() listens asynchronously; read the bound port from the listening
  // callback (server.address() is null immediately after serve() returns).
  const { server, boundPort } = await new Promise<{
    server: ReturnType<typeof serve>;
    boundPort: number;
  }>((resolve) => {
    const s = serve({ fetch: app.fetch, port }, (info) => {
      resolve({ server: s, boundPort: info.port });
    });
  });
  const url = `http://localhost:${boundPort}`;
  console.warn(`enbi: dev server on :${boundPort}`);

  // Admin is best-effort: dev still serves the API if the admin isn't installed.
  const startAdmin = deps.startAdmin ?? startAdminDev;
  let admin: AdminHandle | null = null;
  try {
    admin = await startAdmin(opts.adminPort);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`enbi: admin dev not started — ${message}`);
  }

  const close = async (): Promise<void> => {
    await admin?.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };
  return { url, admin, close };
}
