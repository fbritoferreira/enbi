// @enbi/db — dialect→driver connection factory (ADR-0003, ADR-0018).
import { drizzle as drizzleLibsql, type LibSQLDatabase } from "drizzle-orm/libsql";
import { apiKeysFor, type ApiKeysTable } from "./apikeys.ts";
import type { EnbiDbConfig, EnbiDialect } from "./config.ts";
import { EnbiError } from "./errors.ts";
import { revisionsFor, type RevisionsTable } from "./revisions.ts";

/**
 * The runtime database handle. Typed as the libSQL/SQLite database; the
 * Postgres and MySQL instances are cast to this shape at the single boundary
 * below, since Drizzle's query-builder API is uniform for the CRUD this
 * framework performs. (ADR-0015)
 */
export type EnbiDatabase = LibSQLDatabase<Record<string, never>>;

export type EnbiDb = {
  dialect: EnbiDialect;
  db: EnbiDatabase;
  revisions: RevisionsTable;
  apiKeys: ApiKeysTable;
};

export async function createDb(config: EnbiDbConfig): Promise<EnbiDb> {
  const revisions = revisionsFor(config.dialect);
  const apiKeys = apiKeysFor(config.dialect);

  switch (config.dialect) {
    case "sqlite": {
      const { createClient } = await import("@libsql/client");
      const client = createClient({ url: config.url });
      return { dialect: "sqlite", db: drizzleLibsql(client), revisions, apiKeys };
    }
    case "postgres": {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: config.url });
      return {
        dialect: "postgres",
        db: drizzle(pool) as unknown as EnbiDatabase,
        revisions,
        apiKeys,
      };
    }
    case "mysql": {
      const { drizzle } = await import("drizzle-orm/mysql2");
      const { createPool } = await import("mysql2/promise");
      const pool = createPool(config.url);
      return { dialect: "mysql", db: drizzle(pool) as unknown as EnbiDatabase, revisions, apiKeys };
    }
    default:
      throw new EnbiError("config", `Unknown dialect: ${String(config.dialect)}`);
  }
}
