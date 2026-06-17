// @enbi/db — the generic `_revisions` snapshot table, per dialect (ADR-0015).
import { int, json, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import {
  integer as pgInteger,
  jsonb,
  pgTable,
  text as pgText,
  timestamp,
} from "drizzle-orm/pg-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { EnbiDialect } from "./config.ts";

export const sqliteRevisions = sqliteTable("_revisions", {
  id: text("id").primaryKey(),
  collection: text("collection").notNull(),
  entryId: text("entry_id").notNull(),
  version: integer("version").notNull(),
  snapshot: text("snapshot", { mode: "json" }).notNull(),
  authorId: text("author_id"),
  createdAt: text("created_at").notNull(),
});

export const pgRevisions = pgTable("_revisions", {
  id: pgText("id").primaryKey(),
  collection: pgText("collection").notNull(),
  entryId: pgText("entry_id").notNull(),
  version: pgInteger("version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  authorId: pgText("author_id"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
});

export const mysqlRevisions = mysqlTable("_revisions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  collection: varchar("collection", { length: 255 }).notNull(),
  entryId: varchar("entry_id", { length: 255 }).notNull(),
  version: int("version").notNull(),
  snapshot: json("snapshot").notNull(),
  authorId: varchar("author_id", { length: 255 }),
  createdAt: varchar("created_at", { length: 64 }).notNull(),
});

/**
 * Runtime CRUD is typed against the SQLite shape; the three tables share the
 * same logical columns, so Drizzle's query builder behaves identically for
 * basic operations. The dialect-correct table (used for migration generation)
 * is selected by {@link revisionsFor}. (See ADR-0015.)
 */
export type RevisionsTable = typeof sqliteRevisions;

export function revisionsFor(dialect: EnbiDialect): RevisionsTable {
  switch (dialect) {
    case "sqlite":
      return sqliteRevisions;
    case "postgres":
      return pgRevisions as unknown as RevisionsTable;
    case "mysql":
      return mysqlRevisions as unknown as RevisionsTable;
  }
}
