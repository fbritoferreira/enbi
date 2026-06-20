// @enbi/db — aggregate user collections + `_revisions` + auth tables for migrations.
import { apiKeysFor } from "./apikeys.ts";
import { mediaFor } from "./media.ts";
import type { AnyCollection } from "./collection.ts";
import type { EnbiDialect } from "./config.ts";
import { revisionsFor } from "./revisions.ts";

/**
 * Build the full Drizzle schema object that `drizzle-kit generate` consumes:
 * the dialect-correct `_revisions` table, every registered collection's table,
 * and the better-auth-generated tables passed in by `@enbi/auth`.
 */
export function buildSchema(
  dialect: EnbiDialect,
  collections: AnyCollection[],
  authSchema: Record<string, unknown> = {},
): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    _revisions: revisionsFor(dialect),
    _api_keys: apiKeysFor(dialect),
    _media: mediaFor(dialect),
  };
  for (const entry of collections) {
    schema[entry.name] = entry.table;
  }
  return { ...schema, ...authSchema };
}
