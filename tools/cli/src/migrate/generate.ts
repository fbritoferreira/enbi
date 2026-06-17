// @enbi/cli — `enbi generate`: write a versioned migration file by diffing the
// assembled schema against the previous snapshot (drizzle-kit api) (ADR-0030).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EnbiConfig, EnbiDialect } from "@enbi/db";
import { assembleSchema } from "./schema.ts";

export type GenerateResult = { file: string | null; statements: number };

type Schema = Record<string, unknown>;

async function diff(
  dialect: EnbiDialect,
  schema: Schema,
  prev: unknown,
): Promise<{ cur: unknown; sql: string[] }> {
  const api = await import("drizzle-kit/api");
  if (dialect === "postgres") {
    const cur = api.generateDrizzleJson(schema);
    const base = (prev as never) ?? api.generateDrizzleJson({});
    return { cur, sql: await api.generateMigration(base as never, cur as never) };
  }
  if (dialect === "mysql") {
    const cur = await api.generateMySQLDrizzleJson(schema);
    const base = (prev as never) ?? (await api.generateMySQLDrizzleJson({}));
    return { cur, sql: await api.generateMySQLMigration(base as never, cur as never) };
  }
  const cur = await api.generateSQLiteDrizzleJson(schema);
  const base = (prev as never) ?? (await api.generateSQLiteDrizzleJson({}));
  return { cur, sql: await api.generateSQLiteMigration(base as never, cur as never) };
}

function nextSeq(dir: string): string {
  const count = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).length : 0;
  return String(count).padStart(4, "0");
}

function loadPrevSnapshot(metaDir: string): unknown {
  if (!existsSync(metaDir)) return undefined;
  const snaps = readdirSync(metaDir)
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  const last = snaps.at(-1);
  return last ? JSON.parse(readFileSync(join(metaDir, last), "utf8")) : undefined;
}

export async function generateMigration(
  config: EnbiConfig,
  dialect: EnbiDialect,
  dir = "drizzle",
  name = "enbi",
): Promise<GenerateResult> {
  const schema = assembleSchema(config, dialect);
  const metaDir = join(dir, "meta");
  const { cur, sql } = await diff(dialect, schema, loadPrevSnapshot(metaDir));
  if (sql.length === 0) return { file: null, statements: 0 };

  mkdirSync(metaDir, { recursive: true });
  const seq = nextSeq(dir);
  const file = join(dir, `${seq}_${name}.sql`);
  writeFileSync(file, `${sql.join("\n--> statement-breakpoint\n")}\n`);
  writeFileSync(join(metaDir, `${seq}_snapshot.json`), JSON.stringify(cur, null, 2));
  return { file, statements: sql.length };
}
