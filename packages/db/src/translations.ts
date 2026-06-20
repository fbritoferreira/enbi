// @enbi/db — the `_translations` table, per dialect. Stores field-level locale overrides.
import { mysqlTable, varchar, text as mysqlText } from "drizzle-orm/mysql-core";
import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { EnbiDialect } from "./config.ts";

export const sqliteTranslations = sqliteTable("_translations", {
  id: text("id").primaryKey(),
  collection: text("collection").notNull(),
  entryId: text("entry_id").notNull(),
  locale: text("locale").notNull(),
  field: text("field").notNull(),
  value: text("value"),
});

export const pgTranslations = pgTable("_translations", {
  id: pgText("id").primaryKey(),
  collection: pgText("collection").notNull(),
  entryId: pgText("entry_id").notNull(),
  locale: pgText("locale").notNull(),
  field: pgText("field").notNull(),
  value: pgText("value"),
});

export const mysqlTranslations = mysqlTable("_translations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  collection: varchar("collection", { length: 255 }).notNull(),
  entryId: varchar("entry_id", { length: 255 }).notNull(),
  locale: varchar("locale", { length: 32 }).notNull(),
  field: varchar("field", { length: 255 }).notNull(),
  value: mysqlText("value"),
});

export type TranslationsTable = typeof sqliteTranslations;

export function translationsFor(dialect: EnbiDialect): TranslationsTable {
  switch (dialect) {
    case "sqlite":
      return sqliteTranslations;
    case "postgres":
      return pgTranslations as unknown as TranslationsTable;
    case "mysql":
      return mysqlTranslations as unknown as TranslationsTable;
  }
}
