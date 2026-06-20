// @enbi/server — minimal generic row operations over a registered Drizzle table.
// The table is the user's own `Table`; Drizzle's runtime handles plain-object
// rows uniformly, so values are passed through with a narrow cast.
import { type EnbiDatabase } from "@enbi/db";
import { EnbiError } from "@enbi/db";
import {
  and,
  asc,
  type Column,
  count,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  like,
  lt,
  lte,
  ne,
  or,
  type SQL,
  type Table,
} from "drizzle-orm";

export type Row = Record<string, unknown>;
export type FilterOp = "eq" | "ne" | "like" | "gt" | "gte" | "lt" | "lte" | "in";
export type ListFilter = { column: string; op: FilterOp; value: string };
export type ListOptions = {
  limit?: number;
  offset?: number;
  sort?: { column: string; dir: "asc" | "desc" };
  filters?: ListFilter[];
  match?: "all" | "any";
  cursor?: string;
  primaryKey?: string;
};

export function assertColumn(table: Table, name: string): Column {
  const column = getTableColumns(table)[name];
  if (!column) throw new EnbiError("validation", `Unknown column "${name}".`);
  return column;
}

function pkColumn(table: Table, primaryKey: string): Column {
  const column = getTableColumns(table)[primaryKey];
  if (!column) throw new Error(`Missing primary key column "${primaryKey}".`);
  return column;
}

function filterClause(table: Table, f: ListFilter): SQL {
  const col = assertColumn(table, f.column);
  switch (f.op) {
    case "eq":
      return eq(col, f.value);
    case "ne":
      return ne(col, f.value);
    case "like":
      return like(col, `%${f.value}%`);
    case "gt":
      return gt(col, f.value);
    case "gte":
      return gte(col, f.value);
    case "lt":
      return lt(col, f.value);
    case "lte":
      return lte(col, f.value);
    case "in": {
      const items = f.value.split(",");
      if (items.length > 100) {
        throw new EnbiError("validation", "Too many values in 'in' filter (max 100).");
      }
      return inArray(col, items);
    }
  }
}

function whereFor(
  table: Table,
  filters?: ListFilter[],
  match: "all" | "any" = "all",
): SQL | undefined {
  if (!filters?.length) return undefined;
  const clauses = filters.map((f) => filterClause(table, f));
  if (clauses.length === 1) return clauses[0];
  return match === "any" ? or(...clauses) : and(...clauses);
}

export async function listRows(
  db: EnbiDatabase,
  table: Table,
  opts: ListOptions = {},
): Promise<Row[]> {
  let q = db.select().from(table).$dynamic();
  const filterWhere = whereFor(table, opts.filters, opts.match);

  if (opts.cursor !== undefined && opts.primaryKey !== undefined) {
    // Keyset pagination: add gt(pk, cursor) AND-combined with filter where-clause, order by pk asc.
    const pkCol = pkColumn(table, opts.primaryKey);
    const cursorClause = gt(pkCol, opts.cursor);
    const where = filterWhere ? and(filterWhere, cursorClause) : cursorClause;
    q = q.where(where).orderBy(asc(pkCol));
  } else {
    if (filterWhere) q = q.where(filterWhere);
    if (opts.sort) {
      const col = assertColumn(table, opts.sort.column);
      q = q.orderBy(opts.sort.dir === "desc" ? desc(col) : asc(col));
    }
    if (opts.offset !== undefined) q = q.offset(opts.offset);
  }

  if (opts.limit !== undefined) q = q.limit(opts.limit);
  return (await q) as Row[];
}

export async function countRows(
  db: EnbiDatabase,
  table: Table,
  filters?: ListFilter[],
  match?: "all" | "any",
): Promise<number> {
  let q = db.select({ n: count() }).from(table).$dynamic();
  const where = whereFor(table, filters, match);
  if (where) q = q.where(where);
  const rows = (await q) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function getRow(
  db: EnbiDatabase,
  table: Table,
  primaryKey: string,
  id: string,
): Promise<Row | undefined> {
  const rows = (await db
    .select()
    .from(table)
    .where(eq(pkColumn(table, primaryKey), id))) as Row[];
  return rows[0];
}

export async function insertRow(db: EnbiDatabase, table: Table, values: Row): Promise<void> {
  await db.insert(table).values(values as never);
}

export async function updateRow(
  db: EnbiDatabase,
  table: Table,
  primaryKey: string,
  id: string,
  values: Row,
): Promise<void> {
  await db
    .update(table)
    .set(values as never)
    .where(eq(pkColumn(table, primaryKey), id));
}

export async function deleteRow(
  db: EnbiDatabase,
  table: Table,
  primaryKey: string,
  id: string,
): Promise<void> {
  await db.delete(table).where(eq(pkColumn(table, primaryKey), id));
}
