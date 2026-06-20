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

export type EnbiConfig = {
  db: EnbiDbConfig;
  auth: EnbiAuthConfig;
  roles: Record<string, RolePermission>;
  collections: AnyCollection[];
  /** Admin UI origin allowed to call the API with credentials (CORS). */
  admin?: { origin?: string };
  /** Local-disk media store configuration (ADR-0044). */
  media?: { dir?: string };
};

/** Identity helper that gives the user full type-checking on their config. */
export function defineEnbiConfig(config: EnbiConfig): EnbiConfig {
  return config;
}
