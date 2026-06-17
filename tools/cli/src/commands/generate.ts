// @enbi/cli — `enbi generate`: write a versioned migration file from the current schema.
import { join } from "node:path";
import { loadConfig } from "../config.ts";
import { generateMigration } from "../migrate/generate.ts";

export type GenerateOptions = { cwd?: string; config?: string; dir?: string; name?: string };

export async function runGenerate(opts: GenerateOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd, opts.config);
  const result = await generateMigration(
    config,
    config.db.dialect,
    opts.dir ?? join(cwd, "drizzle"),
    opts.name,
  );
  console.warn(
    result.file
      ? `enbi: wrote ${result.file} (${result.statements} statement(s)).`
      : "enbi: no schema changes.",
  );
}
