// @enbi/server — HTTP API-key management at /api/admin_keys, gated by the `keys`
// permission resource (ADR-0034). Reuses @enbi/auth's key helpers.
import { type EnbiConfig, type EnbiDb, EnbiError } from "@enbi/db";
import { type AuthProvider, issueApiKey, listApiKeys, revokeApiKey } from "@enbi/auth";
import type { Hono } from "hono";
import { authorizeResource } from "./guard.ts";

const RESOURCE = "keys";
// Keys are admin-only: the generic "read" role shorthand must not grant access;
// only `*` or an explicit `keys` grant qualifies (ADR-0034).
const KEYS_OPTS = { allowReadShorthand: false };

export function mountKeys(
  app: Hono,
  ctx: EnbiDb,
  roles: EnbiConfig["roles"],
  auth: AuthProvider,
): void {
  app.get("/api/admin_keys", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "read", c.req.raw.headers, KEYS_OPTS);
    return c.json(await listApiKeys(ctx.db, ctx.apiKeys));
  });

  app.post("/api/admin_keys", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "create", c.req.raw.headers, KEYS_OPTS);
    const body = (await c.req.json()) as { role?: unknown; label?: unknown };
    if (typeof body.role !== "string" || body.role.length === 0) {
      throw new EnbiError("validation", "`role` is required.");
    }
    const label = typeof body.label === "string" ? body.label : undefined;
    const { id, key } = await issueApiKey(ctx.db, ctx.apiKeys, { role: body.role, label });
    return c.json({ id, key }, 201);
  });

  app.delete("/api/admin_keys/:id", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "delete", c.req.raw.headers, KEYS_OPTS);
    const removed = await revokeApiKey(ctx.db, ctx.apiKeys, c.req.param("id"));
    if (!removed) throw new EnbiError("not_found", "API key not found.");
    return c.body(null, 204);
  });
}
