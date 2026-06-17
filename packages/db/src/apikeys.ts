// @enbi/db — the `_api_keys` table, per dialect. Stores only a hash of the key.
// (Native API-key auth; the better-auth api-key plugin is absent from the
// installed better-auth build — see ADR-0020.)
import { mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { pgTable, text as pgText, timestamp } from "drizzle-orm/pg-core";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { EnbiDialect } from "./config.ts";

export const sqliteApiKeys = sqliteTable("_api_keys", {
  id: text("id").primaryKey(),
  hashedKey: text("hashed_key").notNull(),
  role: text("role").notNull(),
  label: text("label"),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at"),
});

export const pgApiKeys = pgTable("_api_keys", {
  id: pgText("id").primaryKey(),
  hashedKey: pgText("hashed_key").notNull(),
  role: pgText("role").notNull(),
  label: pgText("label"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "string" }),
});

export const mysqlApiKeys = mysqlTable("_api_keys", {
  id: varchar("id", { length: 36 }).primaryKey(),
  hashedKey: varchar("hashed_key", { length: 64 }).notNull(),
  role: varchar("role", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }),
  createdAt: varchar("created_at", { length: 64 }).notNull(),
  lastUsedAt: varchar("last_used_at", { length: 64 }),
});

export type ApiKeysTable = typeof sqliteApiKeys;

export function apiKeysFor(dialect: EnbiDialect): ApiKeysTable {
  switch (dialect) {
    case "sqlite":
      return sqliteApiKeys;
    case "postgres":
      return pgApiKeys as unknown as ApiKeysTable;
    case "mysql":
      return mysqlApiKeys as unknown as ApiKeysTable;
  }
}
