// @enbi/server — minimal generic row operations over a registered Drizzle table.
// The table is the user's own `Table`; Drizzle's runtime handles plain-object
// rows uniformly, so values are passed through with a narrow cast.
import type { EnbiDatabase } from "@enbi/db";
import { type Column, eq, getTableColumns, type Table } from "drizzle-orm";

export type Row = Record<string, unknown>;

function pkColumn(table: Table, primaryKey: string): Column {
  const column = getTableColumns(table)[primaryKey];
  if (!column) throw new Error(`Missing primary key column "${primaryKey}".`);
  return column;
}

export async function listRows(db: EnbiDatabase, table: Table): Promise<Row[]> {
  return (await db.select().from(table)) as Row[];
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
