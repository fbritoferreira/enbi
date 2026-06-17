// @enbi/cli — dev-only schema auto-sync via drizzle-kit's programmatic push (ADR-0028).
import { type EnbiConfig, EnbiError, type EnbiDb } from "@enbi/db";
import { assembleSchema } from "./migrate/schema.ts";

export type SyncResult = { statements: string[]; hadDataLoss: boolean; warnings: string[] };

/**
 * Push the unified schema (collections + `_revisions` + `_api_keys` + better-auth
 * tables) to the dev database so tables exist for `enbi dev`, including session
 * auth. Development convenience only — production uses `enbi migrate` (ADR-0028).
 */
export async function syncSchema(ctx: EnbiDb, config: EnbiConfig): Promise<SyncResult> {
  const schema = assembleSchema(config, ctx.dialect);

  switch (ctx.dialect) {
    case "sqlite": {
      const { pushSQLiteSchema } = await import("drizzle-kit/api");
      const result = await pushSQLiteSchema(schema, ctx.db);
      await result.apply();
      return {
        statements: result.statementsToExecute,
        hadDataLoss: result.hasDataLoss,
        warnings: result.warnings,
      };
    }
    case "postgres": {
      const { pushSchema } = await import("drizzle-kit/api");
      const result = await pushSchema(schema, ctx.db as never);
      await result.apply();
      return {
        statements: result.statementsToExecute,
        hadDataLoss: result.hasDataLoss,
        warnings: result.warnings,
      };
    }
    case "mysql": {
      const { pushMySQLSchema } = await import("drizzle-kit/api");
      const database = new URL(config.db.url).pathname.replace(/^\//, "");
      if (!database) throw new EnbiError("config", "MySQL url must include a database name.");
      const result = await pushMySQLSchema(schema, ctx.db as never, database);
      await result.apply();
      return {
        statements: result.statementsToExecute,
        hadDataLoss: result.hasDataLoss,
        warnings: result.warnings,
      };
    }
    default:
      throw new EnbiError("config", `Unknown dialect: ${String(ctx.dialect)}`);
  }
}
