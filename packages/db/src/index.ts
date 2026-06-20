// @enbi/db — Drizzle config surface for enbi (ADR-0003, ADR-0014, ADR-0018).
export {
  apiKeysFor,
  type ApiKeysTable,
  mysqlApiKeys,
  pgApiKeys,
  sqliteApiKeys,
} from "./apikeys.ts";
export { collection, isPublicAction } from "./collection.ts";
export type {
  AnyCollection,
  Collection,
  CollectionOptions,
  FieldRule,
  PublicAccess,
} from "./collection.ts";
export {
  defineEnbiConfig,
  type EnbiAuthConfig,
  type EnbiConfig,
  type EnbiDbConfig,
  type EnbiDialect,
  type OAuthCreds,
  type PermissionAction,
  type RolePermission,
  type SsoProvider,
  type WebhookConfig,
  type WebhookEvent,
  type WebhookPayload,
} from "./config.ts";
export { createDb, type EnbiDatabase, type EnbiDb } from "./connection.ts";
export { EnbiError, type EnbiErrorCode } from "./errors.ts";
export {
  mysqlRevisions,
  pgRevisions,
  revisionsFor,
  type RevisionsTable,
  sqliteRevisions,
} from "./revisions.ts";
export { mediaFor, type MediaTable, mysqlMedia, pgMedia, sqliteMedia } from "./media.ts";
export {
  mysqlTranslations,
  pgTranslations,
  sqliteTranslations,
  translationsFor,
  type TranslationsTable,
} from "./translations.ts";
export { buildSchema } from "./schema.ts";
