// @enbi/core — full row snapshot versioning engine (ADR-0004, ADR-0015).
// Pure functions over the `_revisions` table; no HTTP, no auth.
import { type EnbiDatabase, EnbiError, type RevisionsTable } from "@enbi/db";
import { and, desc, eq } from "drizzle-orm";

export type Revision<T = unknown> = {
  id: string;
  collection: string;
  entryId: string;
  version: number;
  snapshot: T;
  authorId: string | null;
  createdAt: string;
};

export type WriteRevisionInput = {
  collection: string;
  entryId: string;
  data: unknown;
  authorId?: string | null;
  /** ISO timestamp; injectable for deterministic tests. */
  now?: string;
};

export type RevisionRef = {
  collection: string;
  entryId: string;
};

async function latestVersion(
  db: EnbiDatabase,
  revisions: RevisionsTable,
  ref: RevisionRef,
): Promise<number> {
  const rows = await db
    .select({ version: revisions.version })
    .from(revisions)
    .where(and(eq(revisions.collection, ref.collection), eq(revisions.entryId, ref.entryId)))
    .orderBy(desc(revisions.version))
    .limit(1);
  return rows[0]?.version ?? 0;
}

/** Append a full snapshot as the next version for an entry. */
export async function writeRevision<T = unknown>(
  db: EnbiDatabase,
  revisions: RevisionsTable,
  input: WriteRevisionInput,
): Promise<Revision<T>> {
  const version = (await latestVersion(db, revisions, input)) + 1;
  const row: Revision<T> = {
    id: crypto.randomUUID(),
    collection: input.collection,
    entryId: input.entryId,
    version,
    snapshot: input.data as T,
    authorId: input.authorId ?? null,
    createdAt: input.now ?? new Date().toISOString(),
  };
  await db.insert(revisions).values(row);
  return row;
}

/** All revisions for an entry, newest first. */
export async function listRevisions<T = unknown>(
  db: EnbiDatabase,
  revisions: RevisionsTable,
  ref: RevisionRef,
): Promise<Revision<T>[]> {
  const rows = await db
    .select()
    .from(revisions)
    .where(and(eq(revisions.collection, ref.collection), eq(revisions.entryId, ref.entryId)))
    .orderBy(desc(revisions.version));
  return rows as Revision<T>[];
}

/** A single revision by version, or a typed not-found error. */
export async function getRevision<T = unknown>(
  db: EnbiDatabase,
  revisions: RevisionsTable,
  ref: RevisionRef & { version: number },
): Promise<Revision<T>> {
  const rows = await db
    .select()
    .from(revisions)
    .where(
      and(
        eq(revisions.collection, ref.collection),
        eq(revisions.entryId, ref.entryId),
        eq(revisions.version, ref.version),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new EnbiError(
      "not_found",
      `Revision ${ref.version} of ${ref.collection}/${ref.entryId} not found.`,
    );
  }
  return row as Revision<T>;
}

/**
 * Read the snapshot to restore. The caller re-applies it to the live row and
 * then calls {@link writeRevision} so the restore is itself a new version.
 */
export async function restoreRevision<T = unknown>(
  db: EnbiDatabase,
  revisions: RevisionsTable,
  ref: RevisionRef & { version: number },
): Promise<T> {
  const revision = await getRevision<T>(db, revisions, ref);
  return revision.snapshot;
}
