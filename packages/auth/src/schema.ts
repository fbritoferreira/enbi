// @enbi/auth — translate better-auth's table metadata into drizzle tables so the
// migration pipeline creates them like any other table (ADR-0031).
import type { EnbiAuthConfig, EnbiDialect } from "@enbi/db";
import { getSchema } from "better-auth/db";
import { buildAuthOptions } from "./auth.ts";
import type { Table } from "drizzle-orm";
import { int, json, mysqlTable, timestamp as myTimestamp, varchar } from "drizzle-orm/mysql-core";
import {
  boolean as pgBoolean,
  integer as pgInteger,
  jsonb,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
} from "drizzle-orm/pg-core";
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";

type FieldType = "string" | "number" | "boolean" | "date" | "json" | "string[]" | "number[]";
type Field = { type: FieldType; required?: boolean; unique?: boolean; fieldName?: string };
type AuthTables = Record<string, { fields: Record<string, Field> }>;

function sqliteColumns(fields: Record<string, Field>): Record<string, unknown> {
  const cols: Record<string, unknown> = { id: sqliteText("id").primaryKey() };
  for (const [name, field] of Object.entries(fields)) {
    const col = field.fieldName ?? name;
    if (col === "id") continue;
    let c;
    switch (field.type) {
      case "number":
        c = sqliteInteger(col);
        break;
      case "boolean":
        c = sqliteInteger(col, { mode: "boolean" });
        break;
      case "date":
        c = sqliteInteger(col, { mode: "timestamp" });
        break;
      default:
        c =
          field.type === "json" || field.type.endsWith("[]")
            ? sqliteText(col, { mode: "json" })
            : sqliteText(col);
    }
    if (field.required !== false) c = c.notNull();
    if (field.unique) c = c.unique();
    cols[col] = c;
  }
  return cols;
}

function pgColumns(fields: Record<string, Field>): Record<string, unknown> {
  const cols: Record<string, unknown> = { id: pgText("id").primaryKey() };
  for (const [name, field] of Object.entries(fields)) {
    const col = field.fieldName ?? name;
    if (col === "id") continue;
    let c;
    switch (field.type) {
      case "number":
        c = pgInteger(col);
        break;
      case "boolean":
        c = pgBoolean(col);
        break;
      case "date":
        c = pgTimestamp(col, { mode: "string" });
        break;
      default:
        c = field.type === "json" || field.type.endsWith("[]") ? jsonb(col) : pgText(col);
    }
    if (field.required !== false) c = c.notNull();
    if (field.unique) c = c.unique();
    cols[col] = c;
  }
  return cols;
}

function mysqlColumns(fields: Record<string, Field>): Record<string, unknown> {
  const cols: Record<string, unknown> = { id: varchar("id", { length: 255 }).primaryKey() };
  for (const [name, field] of Object.entries(fields)) {
    const col = field.fieldName ?? name;
    if (col === "id") continue;
    let c;
    switch (field.type) {
      case "number":
        c = int(col);
        break;
      case "boolean":
        c = int(col);
        break;
      case "date":
        c = myTimestamp(col, { mode: "string" });
        break;
      default:
        c =
          field.type === "json" || field.type.endsWith("[]")
            ? json(col)
            : varchar(col, { length: 255 });
    }
    if (field.required !== false) c = c.notNull();
    if (field.unique) c = c.unique();
    cols[col] = c;
  }
  return cols;
}

/**
 * Build drizzle tables for better-auth's schema (user/session/account/verification
 * plus plugin-added fields), keyed by table name. Foreign keys are omitted in v1 —
 * better-auth manages relations at the adapter level.
 */
export function authSchema(
  authConfig: EnbiAuthConfig,
  dialect: EnbiDialect,
): Record<string, Table> {
  const schema = getSchema(buildAuthOptions(authConfig) as never) as AuthTables;
  const out: Record<string, Table> = {};
  for (const [model, def] of Object.entries(schema)) {
    switch (dialect) {
      case "sqlite":
        out[model] = sqliteTable(model, sqliteColumns(def.fields) as never) as unknown as Table;
        break;
      case "postgres":
        out[model] = pgTable(model, pgColumns(def.fields) as never) as unknown as Table;
        break;
      case "mysql":
        out[model] = mysqlTable(model, mysqlColumns(def.fields) as never) as unknown as Table;
        break;
    }
  }
  return out;
}
