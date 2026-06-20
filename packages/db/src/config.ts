// @enbi/db — the public config surface (ADR-0018).
import type { AnyCollection } from "./collection.ts";

export type EnbiDialect = "postgres" | "sqlite" | "mysql";

export type EnbiDbConfig = {
  dialect: EnbiDialect;
  /** Connection string. For sqlite, a `file:` URL or `:memory:`. */
  url: string;
};

export type PermissionAction = "read" | "create" | "update" | "delete";

/**
 * A role grants either everything (`"*"`), read-only across all collections
 * (`"read"`), or an explicit per-collection action list (ADR-0017).
 */
export type RolePermission = "*" | "read" | Record<string, readonly PermissionAction[]>;

export type OAuthCreds = { clientId: string; clientSecret: string };

/** A generic OIDC/OAuth provider for SSO (better-auth genericOAuth). */
export type SsoProvider = {
  providerId: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
};

export type EnbiAuthConfig = {
  secret: string;
  baseURL?: string;
  emailPassword?: boolean;
  social?: { github?: OAuthCreds; google?: OAuthCreds };
  /** Generic OIDC/SSO providers (enterprise IdPs). */
  ssoProviders?: SsoProvider[];
  /** Role assigned to users with no explicit role. Defaults to "viewer". */
  defaultRole?: string;
  /**
   * Native API-key auth via the `_api_keys` table (ADR-0020). Keys are tried
   * before sessions. Enabled by default; set false to disable the provider.
   */
  apiKeys?: boolean;
};

export type WebhookEvent = "create" | "update" | "delete";

export type WebhookPayload = {
  event: WebhookEvent;
  collection: string;
  id: string;
  data: unknown;
  timestamp: string;
};

export type WebhookConfig = {
  url: string;
  /** Events that trigger delivery. Defaults to all three. */
  events?: WebhookEvent[];
  /** Collection names that trigger delivery. Defaults to all collections. */
  collections?: string[];
  /** When set, signs the body with HMAC-SHA256; value sent in X-Enbi-Signature. */
  secret?: string;
};

export type EnbiConfig = {
  db: EnbiDbConfig;
  auth: EnbiAuthConfig;
  roles: Record<string, RolePermission>;
  collections: AnyCollection[];
  /**
   * Admin UI origin allowed to call the API with credentials (CORS).
   * Set `crossSite: true` when the admin is on a different domain than the API
   * (requires HTTPS) — opts the session cookie into `SameSite=None; Secure`.
   */
  admin?: { origin?: string; crossSite?: boolean };
  /** Local-disk media store configuration (ADR-0044). */
  media?: { dir?: string };
  /** Outbound webhook endpoints notified on content mutations (ADR-0047). */
  webhooks?: WebhookConfig[];
};

/** Identity helper that gives the user full type-checking on their config. */
export function defineEnbiConfig(config: EnbiConfig): EnbiConfig {
  return config;
}
