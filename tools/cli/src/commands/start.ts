// @enbi/cli — `enbi start`: production boot (no schema sync, no watch).
import { serve } from "@hono/node-server";
import { createServer } from "@enbi/server";
import { loadConfig } from "../config.ts";

export type StartOptions = { cwd?: string; config?: string; port?: number };

export async function runStart(opts: StartOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);
  const app = await createServer(config);
  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  serve({ fetch: app.fetch, port });
  console.warn(`enbi: server listening on :${port}`);
}
