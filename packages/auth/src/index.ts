// @enbi/auth — authentication + RBAC for enbi (ADR-0005, ADR-0017, ADR-0019, ADR-0020).
export {
  type ApiKeyRecord,
  apiKeyProvider,
  composeProviders,
  generateApiKey,
  hashApiKey,
  issueApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from "./apikey.ts";
export {
  AUTH_BASE_PATH,
  betterAuthProvider,
  type BuildAuthOpts,
  buildAuthOptions,
  createAuth,
  DEFAULT_ROLE,
  type EnbiAuth,
  type EnbiAuthOptions,
} from "./auth.ts";
export { authSchema } from "./schema.ts";
export { can, type CanOptions, type RolesConfig } from "./permissions.ts";
export type { AuthProvider, Identity } from "./provider.ts";
