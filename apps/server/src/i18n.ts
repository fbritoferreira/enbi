// @enbi/server — field-level i18n helpers: overlay, read, write translations (ADR-0050).
import { and, eq, inArray } from "drizzle-orm";
import type { EnbiDatabase, TranslationsTable } from "@enbi/db";
import type { Row } from "./crud.ts";

/**
 * Fetch all translations for a list of entry IDs in a single query.
 * Returns a Map keyed by entryId, each value being a { field: value } record.
 */
export async function readTranslationsBatch(
  db: EnbiDatabase,
  table: TranslationsTable,
  collectionName: string,
  entryIds: string[],
  locale: string,
): Promise<Map<string, Record<string, string>>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.collection, collectionName),
        inArray(table.entryId, entryIds),
        eq(table.locale, locale),
      ),
    );
  const result = new Map<string, Record<string, string>>();
  for (const row of rows as { entryId: string; field: string; value: string | null }[]) {
    if (row.value !== null) {
      if (!result.has(row.entryId)) result.set(row.entryId, {});
      result.get(row.entryId)![row.field] = row.value;
    }
  }
  return result;
}

/**
 * Overlay translation values from `_translations` onto `rows` for the given
 * `locale`. For each row, for each field in `localized`, look up a translation
 * and replace `row[field]` if found. Missing translations fall back to the
 * base row value (default-locale value is preserved).
 *
 * Uses a single batched query for all rows (ADR-0054).
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
  const entryIds = rows.map((row) => {
    const rawId = (row as Record<string, unknown>).id;
    return typeof rawId === "string" ? rawId : JSON.stringify(rawId ?? "");
  });
  const translationMap = await readTranslationsBatch(db, table, collectionName, entryIds, locale);
  return rows.map((row) => {
    const rawId = (row as Record<string, unknown>).id;
    const entryId = typeof rawId === "string" ? rawId : JSON.stringify(rawId ?? "");
    const translations = translationMap.get(entryId) ?? {};
    const overlaid = { ...row } as Record<string, unknown>;
    for (const field of localized) {
      if (Object.prototype.hasOwnProperty.call(translations, field)) {
        overlaid[field] = translations[field];
      }
    }
    return overlaid;
  });
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
