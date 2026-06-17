// @enbi/server — Hono content API factory: auto-REST per collection, auth-gated,
// versioned (ADR-0016, ADR-0004). Auth is injectable for testing (ADR-0017).
import { type AnyCollection, createDb, type EnbiConfig, type EnbiDb, EnbiError } from "@enbi/db";
import {
  apiKeyProvider,
  type AuthProvider,
  betterAuthProvider,
  composeProviders,
  createAuth,
} from "@enbi/auth";
import { listRevisions, restoreRevision, writeRevision } from "@enbi/core";
import { Hono } from "hono";
import { deleteRow, getRow, insertRow, listRows, type Row, updateRow } from "./crud.ts";
import { errorHandler } from "./errors.ts";
import { authorize } from "./guard.ts";

export type CreateServerOptions = {
  /** Inject an auth provider (tests). Defaults to a better-auth-backed one. */
  authProvider?: AuthProvider;
  /** Inject an already-created db context (tests). Defaults to createDb(config.db). */
  db?: EnbiDb;
};

function asObject(body: unknown): Row {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new EnbiError("validation", "Request body must be a JSON object.");
  }
  return body as Row;
}

async function snapshot(ctx: EnbiDb, col: AnyCollection, entryId: string, caller: string | null) {
  if (!col.versioned) return;
  const row = await getRow(ctx.db, col.table, col.primaryKey, entryId);
  if (row) {
    await writeRevision(ctx.db, ctx.revisions, {
      collection: col.name,
      entryId,
      data: row,
      authorId: caller,
    });
  }
}

function mountCollection(
  app: Hono,
  ctx: EnbiDb,
  roles: EnbiConfig["roles"],
  auth: AuthProvider,
  col: AnyCollection,
): void {
  const base = `/api/${col.name}`;
  const idOf = (row: Row): string => String(row[col.primaryKey]);

  app.get(base, async (c) => {
    await authorize(auth, roles, col, "read", c.req.raw.headers);
    return c.json(await listRows(ctx.db, col.table));
  });

  app.post(base, async (c) => {
    const caller = await authorize(auth, roles, col, "create", c.req.raw.headers);
    const body = asObject(await c.req.json());
    await insertRow(ctx.db, col.table, body);
    await snapshot(ctx, col, idOf(body), caller.userId);
    return c.json(body, 201);
  });

  app.get(`${base}/:id`, async (c) => {
    await authorize(auth, roles, col, "read", c.req.raw.headers);
    const row = await getRow(ctx.db, col.table, col.primaryKey, c.req.param("id"));
    if (!row) throw new EnbiError("not_found", `${col.name} not found.`);
    return c.json(row);
  });

  app.put(`${base}/:id`, async (c) => {
    const caller = await authorize(auth, roles, col, "update", c.req.raw.headers);
    const id = c.req.param("id");
    const existing = await getRow(ctx.db, col.table, col.primaryKey, id);
    if (!existing) throw new EnbiError("not_found", `${col.name} not found.`);
    await updateRow(ctx.db, col.table, col.primaryKey, id, asObject(await c.req.json()));
    await snapshot(ctx, col, id, caller.userId);
    return c.json(await getRow(ctx.db, col.table, col.primaryKey, id));
  });

  app.delete(`${base}/:id`, async (c) => {
    await authorize(auth, roles, col, "delete", c.req.raw.headers);
    const id = c.req.param("id");
    const existing = await getRow(ctx.db, col.table, col.primaryKey, id);
    if (!existing) throw new EnbiError("not_found", `${col.name} not found.`);
    await deleteRow(ctx.db, col.table, col.primaryKey, id);
    return c.body(null, 204);
  });

  app.get(`${base}/:id/revisions`, async (c) => {
    await authorize(auth, roles, col, "read", c.req.raw.headers);
    return c.json(
      await listRevisions(ctx.db, ctx.revisions, {
        collection: col.name,
        entryId: c.req.param("id"),
      }),
    );
  });

  app.post(`${base}/:id/restore`, async (c) => {
    const caller = await authorize(auth, roles, col, "update", c.req.raw.headers);
    const id = c.req.param("id");
    const { version } = asObject(await c.req.json()) as { version?: number };
    if (typeof version !== "number") throw new EnbiError("validation", "`version` is required.");
    const restored = await restoreRevision<Row>(ctx.db, ctx.revisions, {
      collection: col.name,
      entryId: id,
      version,
    });
    await updateRow(ctx.db, col.table, col.primaryKey, id, restored);
    await snapshot(ctx, col, id, caller.userId);
    return c.json(await getRow(ctx.db, col.table, col.primaryKey, id));
  });
}

export async function createServer(
  config: EnbiConfig,
  opts: CreateServerOptions = {},
): Promise<Hono> {
  const ctx = opts.db ?? (await createDb(config.db));
  const app = new Hono();
  app.onError(errorHandler);
  app.get("/health", (c) => c.json({ status: "ok" }));

  let auth = opts.authProvider;
  if (!auth) {
    const instance = createAuth(ctx, config.auth);
    app.on(["GET", "POST"], "/api/auth/*", (c) => instance.handler(c.req.raw));
    // API key (x-api-key / Bearer) is tried first, then a better-auth session.
    auth = composeProviders(apiKeyProvider(ctx.db, ctx.apiKeys), betterAuthProvider(instance));
  }

  for (const col of config.collections) {
    mountCollection(app, ctx, config.roles, auth, col);
  }
  return app;
}
