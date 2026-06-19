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
  type SQL,
  type Table,
} from "drizzle-orm";

export type Row = Record<string, unknown>;
export type ListFilter = { column: string; value: string };
export type ListOptions = {
  limit?: number;
  offset?: number;
  sort?: { column: string; dir: "asc" | "desc" };
  filters?: ListFilter[];
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

function whereFor(table: Table, filters?: ListFilter[]): SQL | undefined {
  if (!filters?.length) return undefined;
  const clauses = filters.map((f) => eq(assertColumn(table, f.column), f.value));
  return clauses.length === 1 ? clauses[0] : and(...clauses);
}

export async function listRows(
  db: EnbiDatabase,
  table: Table,
  opts: ListOptions = {},
): Promise<Row[]> {
  let q = db.select().from(table).$dynamic();
  const where = whereFor(table, opts.filters);
  if (where) q = q.where(where);
  if (opts.sort) {
    const col = assertColumn(table, opts.sort.column);
    q = q.orderBy(opts.sort.dir === "desc" ? desc(col) : asc(col));
  }
  if (opts.limit !== undefined) q = q.limit(opts.limit);
  if (opts.offset !== undefined) q = q.offset(opts.offset);
  return (await q) as Row[];
}

export async function countRows(
  db: EnbiDatabase,
  table: Table,
  filters?: ListFilter[],
): Promise<number> {
  let q = db.select({ n: count() }).from(table).$dynamic();
  const where = whereFor(table, filters);
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
