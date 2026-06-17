// @enbi/auth — authentication + RBAC for enbi (ADR-0005, ADR-0017, ADR-0019, ADR-0020).
export {
  apiKeyProvider,
  composeProviders,
  generateApiKey,
  hashApiKey,
  verifyApiKey,
} from "./apikey.ts";
export { betterAuthProvider, createAuth, DEFAULT_ROLE, type EnbiAuth } from "./auth.ts";
export { can, type RolesConfig } from "./permissions.ts";
export type { AuthProvider, Identity } from "./provider.ts";
