// @enbi/auth — better-auth wiring (ADR-0005): sessions, email/password, social,
// SSO via genericOAuth, and the admin plugin for the user `role` field.
import type { EnbiAuthConfig, EnbiDb, EnbiDialect } from "@enbi/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, genericOAuth } from "better-auth/plugins";
import type { AuthProvider, Identity } from "./provider.ts";

const DRIZZLE_PROVIDER: Record<EnbiDialect, "sqlite" | "pg" | "mysql"> = {
  sqlite: "sqlite",
  postgres: "pg",
  mysql: "mysql",
};

export const DEFAULT_ROLE = "viewer";

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

export function createAuth(ctx: EnbiDb, authConfig: EnbiAuthConfig): EnbiAuth {
  const social: Record<string, { clientId: string; clientSecret: string }> = {};
  if (authConfig.social?.github) social.github = authConfig.social.github;
  if (authConfig.social?.google) social.google = authConfig.social.google;

  const sso = authConfig.ssoProviders?.length
    ? [genericOAuth({ config: authConfig.ssoProviders })]
    : [];

  return betterAuth({
    database: drizzleAdapter(ctx.db, { provider: DRIZZLE_PROVIDER[ctx.dialect] }),
    secret: authConfig.secret,
    baseURL: authConfig.baseURL,
    emailAndPassword: { enabled: authConfig.emailPassword ?? true },
    socialProviders: social,
    plugins: [admin({ defaultRole: authConfig.defaultRole ?? DEFAULT_ROLE }), ...sso],
  }) as unknown as EnbiAuth;
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
