// @enbi/auth — better-auth wiring (ADR-0005): sessions, email/password, social,
// SSO via genericOAuth, and the admin plugin for the user `role` field.
import type { EnbiAuthConfig, EnbiDb, EnbiDialect } from "@enbi/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import type { AuthProvider, Identity } from "./provider.ts";
import { authSchema } from "./schema.ts";

const DRIZZLE_PROVIDER: Record<EnbiDialect, "sqlite" | "pg" | "mysql"> = {
  sqlite: "sqlite",
  postgres: "pg",
  mysql: "mysql",
};

export const DEFAULT_ROLE = "viewer";

/**
 * System routes are namespaced under `admin_` so they can never collide with a
 * user content collection at `/api/:collection` (ADR-0033). better-auth is
 * mounted (and configured) at this base path.
 */
export const AUTH_BASE_PATH = "/api/admin_auth";

/**
 * The slice of the better-auth instance the framework uses. Declared explicitly
 * so the generated `.d.ts` stays portable (the full inferred better-auth type
 * leaks non-nameable zod internals — TS2883).
 */
export type EnbiAuth = {
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (context: {
      headers: Headers;
    }) => Promise<{ user: { id: string; role?: string | null } } | null>;
  };
};

/**
 * The better-auth options enbi derives from its auth config. `plugins` is
 * `unknown[]` so the exported type stays portable (the real plugin types leak
 * non-nameable zod internals — TS2883); the value is cast at the call sites.
 */
export type EnbiAuthOptions = {
  secret: string;
  baseURL?: string;
  emailAndPassword: { enabled: boolean };
  socialProviders: Record<string, { clientId: string; clientSecret: string }>;
  plugins: unknown[];
};

/**
 * Shared by {@link createAuth} (runtime) and `authSchema` (migration table
 * generation), so both see the same plugins/fields. The DB adapter is added separately.
 */
export function buildAuthOptions(authConfig: EnbiAuthConfig): EnbiAuthOptions {
  const social: Record<string, { clientId: string; clientSecret: string }> = {};
  if (authConfig.social?.github) social.github = authConfig.social.github;
  if (authConfig.social?.google) social.google = authConfig.social.google;

  const sso = authConfig.ssoProviders?.length
    ? [genericOAuth({ config: authConfig.ssoProviders })]
    : [];

  return {
    secret: authConfig.secret,
    baseURL: authConfig.baseURL,
    emailAndPassword: { enabled: authConfig.emailPassword ?? true },
    socialProviders: social,
    plugins: [admin({ defaultRole: authConfig.defaultRole ?? DEFAULT_ROLE }), ...sso],
  };
}

export function createAuth(ctx: EnbiDb, authConfig: EnbiAuthConfig): EnbiAuth {
  return betterAuth({
    database: drizzleAdapter(ctx.db, {
      provider: DRIZZLE_PROVIDER[ctx.dialect],
      // Pass the same tables `authSchema` generates for migrations so the adapter
      // resolves models (user/session/account/...) (ADR-0031).
      schema: authSchema(authConfig, ctx.dialect),
    }),
    basePath: AUTH_BASE_PATH,
    ...buildAuthOptions(authConfig),
  } as never) as unknown as EnbiAuth;
}

/** Adapt a better-auth instance to the framework's {@link AuthProvider}. */
export function betterAuthProvider(auth: EnbiAuth): AuthProvider {
  return {
    async authenticate(headers: Headers): Promise<Identity | null> {
      const session = await auth.api.getSession({ headers });
      if (!session?.user) return null;
      const user = session.user as { id: string; role?: string | null };
      return { userId: user.id, role: user.role ?? null };
    },
  };
}
