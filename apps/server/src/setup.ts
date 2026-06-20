// @enbi/server — GET /api/admin_setup: first-run detection (public, no auth required).
// Returns { needsSetup: true } when the user table has zero rows so the admin UI
// can redirect to the setup wizard before any account exists (ADR-0034 bootstrap).
import type { EnbiAuthConfig, EnbiDb } from "@enbi/db";
import { authSchema } from "@enbi/auth";
import { count } from "drizzle-orm";
import type { Hono } from "hono";

export function mountSetup(app: Hono, ctx: EnbiDb, authConfig: EnbiAuthConfig): void {
  // Derive the user table the same way firstUserAdminHook does in @enbi/auth:
  // authSchema(config, dialect).user gives us the drizzle Table for the user model.
  const userTable = authSchema(authConfig, ctx.dialect).user;

  app.get("/api/admin_setup", async (c) => {
    const rows = (await ctx.db.select({ n: count() }).from(userTable as never)) as Array<{
      n: number;
    }>;
    const userCount = rows[0]?.n ?? 0;
    return c.json({ needsSetup: userCount === 0 });
  });
}
