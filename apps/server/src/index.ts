// @enbi/server — Hono content API factory: auto-REST per collection, auth-gated,
// versioned (ADR-0016, ADR-0004). Auth is injectable for testing (ADR-0017).
import { type AnyCollection, createDb, type EnbiConfig, type EnbiDb, EnbiError } from "@enbi/db";
import {
  apiKeyProvider,
  AUTH_BASE_PATH,
  type AuthProvider,
  betterAuthProvider,
  composeProviders,
  createAuth,
} from "@enbi/auth";
import { listRevisions, restoreRevision, writeRevision } from "@enbi/core";
import { Hono } from "hono";
import {
  countRows,
  deleteRow,
  type FilterOp,
  getRow,
  insertRow,
  type ListFilter,
  listRows,
  type Row,
  updateRow,
} from "./crud.ts";
import { errorHandler } from "./errors.ts";
import { mountCollectionsMeta } from "./collections.ts";
import { mountKeys } from "./keys.ts";
import { mountMedia } from "./media.ts";
import { mountProviders } from "./providers.ts";
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
    const q = c.req.query();
    const reserved = new Set(["limit", "offset", "sort", "_match", "cursor"]);
    const validOps = new Set<FilterOp>(["eq", "ne", "like", "gt", "gte", "lt", "lte", "in"]);
    const filters: ListFilter[] = [];
    // assertColumn (via listRows/countRows) throws EnbiError("validation") → 400 for unknown columns/sort.
    try {
      for (const [key, value] of Object.entries(q)) {
        if (reserved.has(key)) continue;
        const dunder = key.lastIndexOf("__");
        if (dunder !== -1) {
          const column = key.slice(0, dunder);
          const opRaw = key.slice(dunder + 2);
          if (!validOps.has(opRaw as FilterOp)) {
            throw new EnbiError("validation", `Unknown filter operator "${opRaw}".`);
          }
          filters.push({ column, op: opRaw as FilterOp, value });
        } else {
          filters.push({ column: key, op: "eq", value });
        }
      }
      const sortRaw = q.sort;
      const sort = sortRaw
        ? {
            column: sortRaw.replace(/^-/, ""),
            dir: sortRaw.startsWith("-") ? ("desc" as const) : ("asc" as const),
          }
        : undefined;
      const limit =
        q.limit !== undefined ? Math.max(0, Math.min(Number(q.limit) || 0, 100)) : undefined;
      const offset = q.offset !== undefined ? Number(q.offset) || 0 : undefined;
      const match: "all" | "any" = q._match === "any" ? "any" : "all";
      const cursor = q.cursor;
      // cursor mode must always be bounded
      const effectiveLimit = cursor !== undefined && limit === undefined ? 100 : limit;
      if (filters.length > 50) {
        throw new EnbiError("validation", "Too many filters (max 50).");
      }
      const total = await countRows(ctx.db, col.table, filters, match);
      const rows = await listRows(ctx.db, col.table, {
        limit: effectiveLimit,
        offset,
        sort,
        filters,
        match,
        cursor,
        primaryKey: col.primaryKey,
      });
      c.header("X-Total-Count", String(total));
      if (
        cursor !== undefined &&
        rows.length > 0 &&
        effectiveLimit !== undefined &&
        rows.length === effectiveLimit
      ) {
        const lastRow = rows[rows.length - 1] as Row;
        c.header("X-Next-Cursor", String(lastRow[col.primaryKey]));
      }
      return c.json(rows);
    } catch (err) {
      if (err instanceof EnbiError && err.code === "validation") {
        return c.json({ error: err.code, message: err.message }, 400);
      }
      throw err;
    }
  });

  app.post(base, async (c) => {
    const caller = await authorize(auth, roles, col, "create", c.req.raw.headers);
    const body = asObject(await c.req.json());
    const id = idOf(body);
    if (await getRow(ctx.db, col.table, col.primaryKey, id)) {
      throw new EnbiError("conflict", `${col.name} "${id}" already exists.`);
    }
    await insertRow(ctx.db, col.table, body);
    await snapshot(ctx, col, id, caller.userId);
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

  const adminOrigin = config.admin?.origin;
  if (adminOrigin) {
    const { cors } = await import("hono/cors");
    app.use(
      "*",
      cors({
        origin: adminOrigin,
        credentials: true,
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowHeaders: ["content-type", "x-api-key", "authorization"],
        exposeHeaders: ["X-Total-Count", "X-Next-Cursor"],
      }),
    );
  }

  app.get("/health", (c) => c.json({ status: "ok" }));
  mountProviders(app, config);

  let auth = opts.authProvider;
  if (!auth) {
    const trustedOrigins = adminOrigin ? [adminOrigin] : undefined;
    const instance = createAuth(ctx, config.auth, trustedOrigins);
    app.on(["GET", "POST"], `${AUTH_BASE_PATH}/*`, (c) => instance.handler(c.req.raw));
    // API key (x-api-key / Bearer) is tried first, then a better-auth session.
    auth = composeProviders(apiKeyProvider(ctx.db, ctx.apiKeys), betterAuthProvider(instance));
  }

  mountKeys(app, ctx, config.roles, auth);
  mountMedia(app, ctx, config.roles, auth, config);
  mountCollectionsMeta(app, config.roles, auth, config.collections);
  for (const col of config.collections) {
    mountCollection(app, ctx, config.roles, auth, col);
  }
  return app;
}
