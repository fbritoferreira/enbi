// @enbi/cli — `enbi migrate`: apply pending migrations to the configured database.
import { join } from "node:path";
import { createDb } from "@enbi/db";
import { loadConfig } from "../config.ts";
import { applyMigrations } from "../migrate/apply.ts";

export type MigrateOptions = { cwd?: string; config?: string; dir?: string };

export async function runMigrate(opts: MigrateOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);
  const ctx = await createDb(config.db);
  const applied = await applyMigrations(ctx, opts.dir ?? join(cwd, "drizzle"));
  console.warn(
    applied.length > 0
      ? `enbi: applied ${applied.length} migration(s): ${applied.join(", ")}`
      : "enbi: no pending migrations.",
  );
}
