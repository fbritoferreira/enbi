// GET /api/admin_providers — public endpoint that lists configured provider ids
// so the admin login page can render social/SSO buttons. Exposes no credentials.
import type { EnbiConfig } from "@enbi/db";
import type { Hono } from "hono";

export function mountProviders(app: Hono, config: EnbiConfig): void {
  app.get("/api/admin_providers", (c) => {
    const social = Object.entries(config.auth.social ?? {})
      .filter(([, creds]) => Boolean(creds))
      .map(([key]) => key);

    const sso = config.auth.ssoProviders?.map((p) => p.providerId) ?? [];

    return c.json({ social, sso });
  });
}
