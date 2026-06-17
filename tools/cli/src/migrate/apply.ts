// @enbi/cli — `enbi migrate`: apply pending migration files, tracked in `_enbi_migrations` (ADR-0030).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type EnbiDb, EnbiError } from "@enbi/db";
import { sql } from "drizzle-orm";

type Executor = { execute?: (query: unknown) => Promise<{ rows?: { name: string }[] }> };

async function exec(ctx: EnbiDb, statement: string): Promise<void> {
  const query = sql.raw(statement);
  if (ctx.dialect === "sqlite") {
    await ctx.db.run(query);
    return;
  }
  const db = ctx.db as unknown as Executor;
  if (!db.execute) throw new EnbiError("config", `Cannot execute SQL for dialect ${ctx.dialect}.`);
  await db.execute(query);
}

async function appliedNames(ctx: EnbiDb): Promise<Set<string>> {
  if (ctx.dialect === "sqlite") {
    const rows = await ctx.db.all<{ name: string }>(sql`SELECT name FROM _enbi_migrations`);
    return new Set(rows.map((r) => r.name));
  }
  const db = ctx.db as unknown as Required<Executor>;
  const res = await db.execute(sql`SELECT name FROM _enbi_migrations`);
  return new Set((res.rows ?? []).map((r) => r.name));
}

export async function applyMigrations(
  ctx: EnbiDb,
  dir = "drizzle",
  now?: string,
): Promise<string[]> {
  if (!existsSync(dir)) throw new EnbiError("config", `No migrations directory: ${dir}.`);
  // `varchar(191)` not `text`: MySQL cannot use a TEXT column as a primary key
  // (ER_BLOB_KEY_WITHOUT_LENGTH); 191 stays within the utf8mb4 index limit and is
  // portable to SQLite/Postgres.
  await exec(
    ctx,
    "CREATE TABLE IF NOT EXISTS _enbi_migrations (name varchar(191) PRIMARY KEY, applied_at text NOT NULL)",
  );
  const done = await appliedNames(ctx);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const content = readFileSync(join(dir, file), "utf8");
    for (const part of content.split("--> statement-breakpoint")) {
      const statement = part.trim();
      if (statement) await exec(ctx, statement);
    }
    const stamp = now ?? new Date().toISOString();
    await exec(
      ctx,
      `INSERT INTO _enbi_migrations (name, applied_at) VALUES ('${file}', '${stamp}')`,
    );
    applied.push(file);
  }
  return applied;
}
