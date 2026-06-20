// @enbi/db — the `_media` table, per dialect. Stores metadata for uploaded files.
import { int, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { integer as pgInteger, pgTable, text as pgText, timestamp } from "drizzle-orm/pg-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { EnbiDialect } from "./config.ts";

export const sqliteMedia = sqliteTable("_media", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
});

export const pgMedia = pgTable("_media", {
  id: pgText("id").primaryKey(),
  filename: pgText("filename").notNull(),
  mime: pgText("mime").notNull(),
  size: pgInteger("size").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull(),
});

export const mysqlMedia = mysqlTable("_media", {
  id: varchar("id", { length: 36 }).primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mime: varchar("mime", { length: 255 }).notNull(),
  size: int("size").notNull(),
  createdAt: varchar("created_at", { length: 64 }).notNull(),
});

export type MediaTable = typeof sqliteMedia;

export function mediaFor(dialect: EnbiDialect): MediaTable {
  switch (dialect) {
    case "sqlite":
      return sqliteMedia;
    case "postgres":
      return pgMedia as unknown as MediaTable;
    case "mysql":
      return mysqlMedia as unknown as MediaTable;
  }
}
