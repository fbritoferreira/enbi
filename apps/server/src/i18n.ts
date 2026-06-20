// @enbi/server — field-level i18n helpers: overlay, read, write translations (ADR-0050).
import { and, eq } from "drizzle-orm";
import type { EnbiDatabase, TranslationsTable } from "@enbi/db";
import type { Row } from "./crud.ts";

/**
 * Overlay translation values from `_translations` onto `rows` for the given
 * `locale`. For each row, for each field in `localized`, look up a translation
 * and replace `row[field]` if found. Missing translations fall back to the
 * base row value (default-locale value is preserved).
 *
 * Note: performs one DB query per row (N+1). Acceptable for typical CMS page
 * sizes; documented as a known tradeoff in ADR-0050.
 */
export async function overlayTranslations(
  db: EnbiDatabase,
  table: TranslationsTable,
  rows: Row[],
  collectionName: string,
  locale: string,
  localized: string[],
): Promise<Row[]> {
  if (localized.length === 0) return rows;
  const result: Row[] = [];
  for (const row of rows) {
    const rawId = (row as Record<string, unknown>).id;
    const entryId = typeof rawId === "string" ? rawId : JSON.stringify(rawId ?? "");
    const translations = await readTranslations(db, table, collectionName, entryId, locale);
    const overlaid = { ...row } as Record<string, unknown>;
    for (const field of localized) {
      if (Object.prototype.hasOwnProperty.call(translations, field)) {
        overlaid[field] = translations[field];
      }
    }
    result.push(overlaid);
  }
  return result;
}

/**
 * Read all stored translations for a single (collection, entryId, locale) tuple.
 * Returns a `{ [field]: value }` map. Missing entries simply do not appear.
 */
export async function readTranslations(
  db: EnbiDatabase,
  table: TranslationsTable,
  collectionName: string,
  entryId: string,
  locale: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.collection, collectionName),
        eq(table.entryId, entryId),
        eq(table.locale, locale),
      ),
    );
  const out: Record<string, string> = {};
  for (const row of rows as { field: string; value: string | null }[]) {
    if (row.value !== null) {
      out[row.field] = row.value;
    }
  }
  return out;
}

/**
 * Upsert translations for a (collection, entryId, locale) tuple.
 * Deletes existing rows for each field then inserts fresh ones (simple upsert).
 * Returns the stored translations for the tuple after writing.
 */
export async function writeTranslations(
  db: EnbiDatabase,
  table: TranslationsTable,
  collectionName: string,
  entryId: string,
  locale: string,
  fields: Record<string, string>,
): Promise<Record<string, string>> {
  for (const [field, value] of Object.entries(fields)) {
    // Delete existing row for this tuple then insert.
    await db
      .delete(table)
      .where(
        and(
          eq(table.collection, collectionName),
          eq(table.entryId, entryId),
          eq(table.locale, locale),
          eq(table.field, field),
        ),
      );
    await db.insert(table).values({
      id: `${collectionName}:${entryId}:${locale}:${field}`,
      collection: collectionName,
      entryId,
      locale,
      field,
      value,
    });
  }
  return await readTranslations(db, table, collectionName, entryId, locale);
}
