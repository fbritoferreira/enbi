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
import { isNull, lte, or, type SQL } from "drizzle-orm";
import { listRevisions, restoreRevision, writeRevision } from "@enbi/core";
import { Hono } from "hono";
import { overlayTranslations, readTranslations, writeTranslations } from "./i18n.ts";
import {
  assertColumn,
  countRows,
  deleteRow,
  type FilterOp,
  getRow,
  getRowsByIds,
  insertRow,
  type ListFilter,
  listRows,
  type Row,
  updateRow,
} from "./crud.ts";
import { errorHandler, ValidationError } from "./errors.ts";
import { validateFields } from "./validate.ts";
import { mountCollectionsMeta } from "./collections.ts";
import { mountKeys } from "./keys.ts";
import { mountSetup } from "./setup.ts";
import { mountMedia } from "./media.ts";
import { mountProviders } from "./providers.ts";
import { authorize, PUBLIC_ROLE } from "./guard.ts";
import { defaultWebhookSink, makeWebhookEmitter, type WebhookSink } from "./webhooks.ts";

export type CreateServerOptions = {
  /** Inject an auth provider (tests). Defaults to a better-auth-backed one. */
  authProvider?: AuthProvider;
  /** Inject an already-created db context (tests). Defaults to createDb(config.db). */
  db?: EnbiDb;
  /** Inject a webhook sink (tests). Defaults to the real fire-and-forget fetch sink. */
  webhookSink?: WebhookSink;
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

/**
 * Apply the draft and scheduled public gates to an already-fetched row.
 * Returns the row if it should be visible to `callerRole`, or null if it
 * should be hidden. Pure function — no DB access (ADR-0054).
 */
function gateExpandedRow(
  targetCol: AnyCollection,
  row: Row | null | undefined,
  callerRole: string,
): Row | null {
  if (!row) return null;
  if (
    targetCol.drafts &&
    callerRole === PUBLIC_ROLE &&
    row[targetCol.drafts.column] !== "published"
  ) {
    return null;
  }
  if (targetCol.scheduled && callerRole === PUBLIC_ROLE) {
    const p = row[targetCol.scheduled.column];
    if (typeof p === "string" && p > new Date().toISOString()) return null;
  }
  return row;
}

/**
 * Resolve a single expanded relation field value for `row`, applying the
 * target collection's draft gate so public callers never see draft rows
 * via expansion (ADR-0045).
 */
async function resolveExpanded(
  ctx: EnbiDb,
  targetCol: AnyCollection,
  fkValue: unknown,
  callerRole: string,
): Promise<Row | null> {
  if (fkValue == null || fkValue === "") return null;
  const expanded = await getRow(ctx.db, targetCol.table, targetCol.primaryKey, fkValue as string);
  return gateExpandedRow(targetCol, expanded, callerRole);
}

function mountCollection(
  app: Hono,
  ctx: EnbiDb,
  roles: EnbiConfig["roles"],
  auth: AuthProvider,
  col: AnyCollection,
  collections: AnyCollection[],
  emit: (
    event: "create" | "update" | "delete",
    collection: string,
    id: string,
    data: unknown,
  ) => void,
  configuredLocales: string[],
  defaultLocale: string | undefined,
): void {
  const base = `/api/${col.name}`;
  const idOf = (row: Row): string => String(row[col.primaryKey]);

  app.get(base, async (c) => {
    const caller = await authorize(auth, roles, col, "read", c.req.raw.headers);
    const q = c.req.query();
    const reserved = new Set(["limit", "offset", "sort", "_match", "cursor", "expand", "locale"]);
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
      let match: "all" | "any" = q._match === "any" ? "any" : "all";
      const cursor = q.cursor;
      // cursor mode must always be bounded
      const effectiveLimit = cursor !== undefined && limit === undefined ? 100 : limit;
      if (filters.length > 50) {
        throw new EnbiError("validation", "Too many filters (max 50).");
      }
      // Draft filtering: public callers only see published rows (ADR-0045).
      // Force match="all" so the status=published predicate is always ANDed with
      // user-supplied filters even when the caller sends _match=any. Public callers
      // on a drafts collection have no legitimate need for OR semantics that crosses
      // the status boundary; OR semantics still apply across their own filter set
      // because we enforce "all" only when this gate is active.
      if (col.drafts && caller.role === PUBLIC_ROLE) {
        filters.push({ column: col.drafts.column, op: "eq", value: "published" });
        match = "all";
      }
      // Scheduled-publish gate (ADR-0052): public callers only see rows where the
      // publish_at column IS NULL or <= now (UTC ISO-8601). This is expressed as a
      // SQL predicate (extraWhere) so it is always AND-combined with user filters,
      // even when match="any", regardless of the OR/AND mode chosen by the user.
      let scheduleExtraWhere: SQL | undefined;
      if (col.scheduled && caller.role === PUBLIC_ROLE) {
        const nowIso = new Date().toISOString();
        const schedCol = assertColumn(col.table, col.scheduled.column);
        scheduleExtraWhere = or(isNull(schedCol), lte(schedCol, nowIso));
      }
      const localeParam = q.locale;
      if (localeParam !== undefined && !configuredLocales.includes(localeParam)) {
        return c.json(
          { error: "validation", message: `Locale "${localeParam}" is not configured.` },
          400,
        );
      }
      const total = await countRows(ctx.db, col.table, filters, match, scheduleExtraWhere);
      const rows = await listRows(ctx.db, col.table, {
        limit: effectiveLimit,
        offset,
        sort,
        filters,
        match,
        cursor,
        primaryKey: col.primaryKey,
        extraWhere: scheduleExtraWhere,
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
      let finalRows = rows;
      if (localeParam !== undefined && localeParam !== defaultLocale && col.localized.length > 0) {
        finalRows = await overlayTranslations(
          ctx.db,
          ctx.translations,
          rows,
          col.name,
          localeParam,
          col.localized,
        );
      }
      const expandParam = q.expand;
      if (expandParam) {
        const expandFields = expandParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const field of expandFields) {
          if (!col.relations[field]) {
            throw new EnbiError(
              "validation",
              `"${field}" is not a declared relation on "${col.name}".`,
            );
          }
          const targetCol = collections.find((c) => c.name === col.relations[field].collection);
          if (!targetCol) {
            throw new EnbiError(
              "config",
              `Relation target collection "${col.relations[field].collection}" is not registered.`,
            );
          }
          const fkValues = finalRows
            .map((r) => r[field])
            .filter((v): v is string => v != null && v !== "");
          const fetched = await getRowsByIds(ctx.db, targetCol.table, targetCol.primaryKey, [
            ...new Set(fkValues),
          ]);
          const byId = new Map(fetched.map((r) => [String(r[targetCol.primaryKey]), r]));
          for (const row of finalRows) {
            const r = row as Row;
            const fk = r[field];
            const fkStr = typeof fk === "string" ? fk : null;
            const target = fkStr != null && fkStr !== "" ? byId.get(fkStr) : undefined;
            (r as Record<string, unknown>)._expanded = {
              ...((r as Record<string, unknown>)._expanded as object | undefined),
              [field]: gateExpandedRow(targetCol, target, caller.role),
            };
          }
        }
      }
      return c.json(finalRows);
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
    // Draft default: if the collection has drafts enabled and no status value was
    // provided (or an explicit null was sent), default the status column to "draft"
    // (ADR-0045). Using == null covers both undefined and null.
    if (col.drafts && body[col.drafts.column] == null) {
      body[col.drafts.column] = "draft";
    }
    // Field validation (ADR-0049): run before duplicate-id check or DB insert.
    if (Object.keys(col.validate).length > 0) {
      const errs = validateFields(col.validate, body);
      if (errs.length > 0) {
        throw new ValidationError("Validation failed.", errs);
      }
    }
    const id = idOf(body);
    if (await getRow(ctx.db, col.table, col.primaryKey, id)) {
      throw new EnbiError("conflict", `${col.name} "${id}" already exists.`);
    }
    await insertRow(ctx.db, col.table, body);
    await snapshot(ctx, col, id, caller.userId);
    emit("create", col.name, id, body);
    return c.json(body, 201);
  });

  app.get(`${base}/:id`, async (c) => {
    const caller = await authorize(auth, roles, col, "read", c.req.raw.headers);
    const row = await getRow(ctx.db, col.table, col.primaryKey, c.req.param("id"));
    if (!row) throw new EnbiError("not_found", `${col.name} not found.`);
    // Draft gate: hide non-published rows from public callers (ADR-0045).
    if (col.drafts && caller.role === PUBLIC_ROLE && row[col.drafts.column] !== "published") {
      throw new EnbiError("not_found", `${col.name} not found.`);
    }
    // Scheduled-publish gate: hide rows whose publish_at is set and in the future
    // from public callers (ADR-0052). Authenticated callers see all rows.
    if (col.scheduled && caller.role === PUBLIC_ROLE) {
      const publishAt = row[col.scheduled.column];
      if (typeof publishAt === "string" && publishAt > new Date().toISOString()) {
        throw new EnbiError("not_found", `${col.name} not found.`);
      }
    }
    const q = c.req.query();
    const localeParam = q.locale;
    if (localeParam !== undefined) {
      if (!configuredLocales.includes(localeParam)) {
        return c.json(
          { error: "validation", message: `Locale "${localeParam}" is not configured.` },
          400,
        );
      }
      if (col.localized.length > 0 && localeParam !== defaultLocale) {
        const translations = await readTranslations(
          ctx.db,
          ctx.translations,
          col.name,
          idOf(row),
          localeParam,
        );
        for (const field of col.localized) {
          if (Object.prototype.hasOwnProperty.call(translations, field)) {
            (row as Record<string, unknown>)[field] = translations[field];
          }
        }
      }
    }
    const expandParam = q.expand;
    if (expandParam) {
      try {
        const expandFields = expandParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const field of expandFields) {
          if (!col.relations[field]) {
            throw new EnbiError(
              "validation",
              `"${field}" is not a declared relation on "${col.name}".`,
            );
          }
          const targetCol = collections.find((c) => c.name === col.relations[field].collection);
          if (!targetCol) {
            throw new EnbiError(
              "config",
              `Relation target collection "${col.relations[field].collection}" is not registered.`,
            );
          }
          const expanded = await resolveExpanded(ctx, targetCol, row[field], caller.role);
          (row as Record<string, unknown>)._expanded = {
            ...((row as Record<string, unknown>)._expanded as object | undefined),
            [field]: expanded,
          };
        }
      } catch (err) {
        if (err instanceof EnbiError && err.code === "validation") {
          return c.json({ error: err.code, message: err.message }, 400);
        }
        throw err;
      }
    }
    return c.json(row);
  });

  app.put(`${base}/:id`, async (c) => {
    const caller = await authorize(auth, roles, col, "update", c.req.raw.headers);
    const id = c.req.param("id");
    const existing = await getRow(ctx.db, col.table, col.primaryKey, id);
    if (!existing) throw new EnbiError("not_found", `${col.name} not found.`);
    const updateBody = asObject(await c.req.json());
    // Field validation (ADR-0049): PUT is treated as a full-replace — validate
    // the provided fields plus required rules. Required fields that are absent
    // from the PUT body will trigger a required error.
    if (Object.keys(col.validate).length > 0) {
      const errs = validateFields(col.validate, updateBody);
      if (errs.length > 0) {
        throw new ValidationError("Validation failed.", errs);
      }
    }
    await updateRow(ctx.db, col.table, col.primaryKey, id, updateBody);
    await snapshot(ctx, col, id, caller.userId);
    const updated = await getRow(ctx.db, col.table, col.primaryKey, id);
    emit("update", col.name, id, updated);
    return c.json(updated);
  });

  app.delete(`${base}/:id`, async (c) => {
    await authorize(auth, roles, col, "delete", c.req.raw.headers);
    const id = c.req.param("id");
    const existing = await getRow(ctx.db, col.table, col.primaryKey, id);
    if (!existing) throw new EnbiError("not_found", `${col.name} not found.`);
    await deleteRow(ctx.db, col.table, col.primaryKey, id);
    emit("delete", col.name, id, { id });
    return c.body(null, 204);
  });

  app.get(`${base}/:id/revisions`, async (c) => {
    const caller = await authorize(auth, roles, col, "read", c.req.raw.headers);
    const id = c.req.param("id");
    // Draft gate: public callers cannot access revision history of unpublished entries (ADR-0045).
    let revisionsRow: Awaited<ReturnType<typeof getRow>> | undefined;
    if (col.drafts && caller.role === PUBLIC_ROLE) {
      revisionsRow = await getRow(ctx.db, col.table, col.primaryKey, id);
      if (!revisionsRow || revisionsRow[col.drafts.column] !== "published") {
        throw new EnbiError("not_found", `${col.name} not found.`);
      }
    }
    // Scheduled gate: public callers cannot access revision history of future-scheduled
    // entries — reuse the already-fetched row when available (ADR-0052).
    if (col.scheduled && caller.role === PUBLIC_ROLE) {
      const row = revisionsRow ?? (await getRow(ctx.db, col.table, col.primaryKey, id));
      if (!row) throw new EnbiError("not_found", `${col.name} not found.`);
      const publishAt = row[col.scheduled.column];
      if (typeof publishAt === "string" && publishAt > new Date().toISOString()) {
        throw new EnbiError("not_found", `${col.name} not found.`);
      }
    }
    return c.json(
      await listRevisions(ctx.db, ctx.revisions, {
        collection: col.name,
        entryId: id,
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

  // GET /api/:col/:id/translations/:locale — read stored translations
  app.get(`${base}/:id/translations/:locale`, async (c) => {
    const caller = await authorize(auth, roles, col, "read", c.req.raw.headers);
    const id = c.req.param("id");
    const locale = c.req.param("locale");
    if (!configuredLocales.includes(locale)) {
      return c.json({ error: "validation", message: `Locale "${locale}" is not configured.` }, 400);
    }
    const existing = await getRow(ctx.db, col.table, col.primaryKey, id);
    if (!existing) throw new EnbiError("not_found", `${col.name} not found.`);
    // Draft gate: public callers must not read translations of a non-published entry (ADR-0045).
    if (col.drafts && caller.role === PUBLIC_ROLE && existing[col.drafts.column] !== "published") {
      throw new EnbiError("not_found", `${col.name} not found.`);
    }
    // Scheduled gate: public callers must not read translations of a future-scheduled entry
    // (ADR-0052). Reuse the already-fetched `existing` row.
    if (col.scheduled && caller.role === PUBLIC_ROLE) {
      const publishAt = existing[col.scheduled.column];
      if (typeof publishAt === "string" && publishAt > new Date().toISOString()) {
        throw new EnbiError("not_found", `${col.name} not found.`);
      }
    }
    const translations = await readTranslations(ctx.db, ctx.translations, col.name, id, locale);
    return c.json(translations);
  });

  // PUT /api/:col/:id/translations/:locale — write translations
  app.put(`${base}/:id/translations/:locale`, async (c) => {
    await authorize(auth, roles, col, "update", c.req.raw.headers);
    const id = c.req.param("id");
    const locale = c.req.param("locale");
    if (!configuredLocales.includes(locale)) {
      return c.json({ error: "validation", message: `Locale "${locale}" is not configured.` }, 400);
    }
    const existing = await getRow(ctx.db, col.table, col.primaryKey, id);
    if (!existing) throw new EnbiError("not_found", `${col.name} not found.`);
    const body = asObject(await c.req.json());
    // Validate: every key in body must be in col.localized.
    const nonLocalized = Object.keys(body).filter((k) => !col.localized.includes(k));
    if (nonLocalized.length > 0) {
      return c.json(
        { error: "validation", message: `Field(s) not translatable: ${nonLocalized.join(", ")}.` },
        422,
      );
    }
    const fields = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
    const stored = await writeTranslations(ctx.db, ctx.translations, col.name, id, locale, fields);
    return c.json(stored);
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
    const instance = createAuth(ctx, config.auth, trustedOrigins, config.admin?.crossSite);
    app.on(["GET", "POST"], `${AUTH_BASE_PATH}/*`, (c) => instance.handler(c.req.raw));
    // API key (x-api-key / Bearer) is tried first, then a better-auth session.
    auth = composeProviders(apiKeyProvider(ctx.db, ctx.apiKeys), betterAuthProvider(instance));
  }

  const emit = makeWebhookEmitter(config.webhooks, opts.webhookSink ?? defaultWebhookSink);

  mountSetup(app, ctx, config.auth);
  mountKeys(app, ctx, config.roles, auth);
  mountMedia(app, ctx, config.roles, auth, config);
  mountCollectionsMeta(app, config.roles, auth, config.collections, config.i18n);
  for (const col of config.collections) {
    mountCollection(
      app,
      ctx,
      config.roles,
      auth,
      col,
      config.collections,
      emit,
      config.i18n?.locales ?? [],
      config.i18n?.defaultLocale,
    );
  }
  return app;
}
