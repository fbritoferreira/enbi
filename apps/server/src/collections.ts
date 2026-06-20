// @enbi/server — GET /api/admin_collections: collection metadata for the admin UI
// (admin-only, ADR-0041). The admin renders nav + forms from this, never from config.
import type { AnyCollection, EnbiConfig, FieldRule } from "@enbi/db";
import type { AuthProvider } from "@enbi/auth";
import { getTableColumns } from "drizzle-orm";
import type { Hono } from "hono";
import { authorizeResource } from "./guard.ts";

const RESOURCE = "collections";
const OPTS = { allowReadShorthand: false }; // admin-only, like keys (ADR-0034)

type ColumnMeta = { name: string; type: string; notNull: boolean };
type CollectionMeta = {
  name: string;
  title: string | null;
  primaryKey: string;
  columns: ColumnMeta[];
  /** Draft/publish configuration. `false` means disabled. (ADR-0045) */
  drafts: { column: string } | false;
  /** FK relations declared on this collection. (ADR-0046) */
  relations: Record<string, { collection: string }>;
  /** Per-field validation rules for this collection. (ADR-0049) */
  validate: Record<string, FieldRule>;
  /** Names of translatable fields (ADR-0050). Empty array = none. */
  localized: string[];
};

type CollectionsMeta = {
  collections: CollectionMeta[];
  /** Configured i18n locales (ADR-0050). Empty if i18n not configured. */
  locales: string[];
  /** Default locale (ADR-0050). Undefined if i18n not configured. */
  defaultLocale: string | undefined;
};

function metaOf(col: AnyCollection): CollectionMeta {
  const columns = Object.entries(getTableColumns(col.table)).map(([name, c]) => ({
    name,
    type: (c as { dataType?: string }).dataType ?? "unknown",
    notNull: Boolean((c as { notNull?: boolean }).notNull),
  }));
  return {
    name: col.name,
    title: col.title ?? null,
    primaryKey: col.primaryKey,
    columns,
    drafts: col.drafts,
    relations: col.relations,
    validate: col.validate,
    localized: col.localized,
  };
}

export function mountCollectionsMeta(
  app: Hono,
  roles: EnbiConfig["roles"],
  auth: AuthProvider,
  collections: AnyCollection[],
  i18n?: EnbiConfig["i18n"],
): void {
  app.get("/api/admin_collections", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "read", c.req.raw.headers, OPTS);
    const payload: CollectionsMeta = {
      collections: collections.map(metaOf),
      locales: i18n?.locales ?? [],
      defaultLocale: i18n?.defaultLocale,
    };
    return c.json(payload);
  });
}
