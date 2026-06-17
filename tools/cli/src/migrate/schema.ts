// @enbi/cli — assemble the full drizzle schema (content + _revisions + _api_keys + auth).
import { authSchema } from "@enbi/auth";
import { buildSchema, type EnbiConfig, type EnbiDialect } from "@enbi/db";

export function assembleSchema(config: EnbiConfig, dialect: EnbiDialect): Record<string, unknown> {
  return buildSchema(dialect, config.collections, authSchema(config.auth, dialect));
}
