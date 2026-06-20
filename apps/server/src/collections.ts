// @enbi/server — GET /api/admin_collections: collection metadata for the admin UI
// (admin-only, ADR-0041). The admin renders nav + forms from this, never from config.
import type { AnyCollection, EnbiConfig } from "@enbi/db";
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
  };
}

export function mountCollectionsMeta(
  app: Hono,
  roles: EnbiConfig["roles"],
  auth: AuthProvider,
  collections: AnyCollection[],
): void {
  app.get("/api/admin_collections", async (c) => {
    await authorizeResource(auth, roles, RESOURCE, "read", c.req.raw.headers, OPTS);
    return c.json(collections.map(metaOf));
  });
}
