// @enbi/db — register a user's Drizzle table as a content collection (ADR-0014).
import { getTableColumns, type Table } from "drizzle-orm";
import type { PermissionAction } from "./config.ts";
import { EnbiError } from "./errors.ts";

/**
 * Which actions are publicly accessible (no auth middleware runs). `true` means
 * all actions are public; an array names the public actions; omitted/`false`
 * means none. (ADR-0019)
 */
export type PublicAccess = boolean | readonly PermissionAction[];

export type CollectionOptions = {
  /** URL segment + storage key for this collection, e.g. "posts". */
  name: string;
  /** Column used as the human-readable title in the admin. */
  title?: string;
  /** Whether saves write a full snapshot to `_revisions`. Defaults to true. */
  versioned?: boolean;
  /** Permission resource key; defaults to `name` (ADR-0017). */
  permissionsKey?: string;
  /** Actions accessible without authentication (ADR-0019). Defaults to none. */
  public?: PublicAccess;
};

export type Collection<T extends Table = Table> = {
  table: T;
  name: string;
  title: string | undefined;
  versioned: boolean;
  permissionsKey: string;
  public: PublicAccess;
  /** Property name of the table's single primary-key column. */
  primaryKey: string;
};

export type AnyCollection = Collection;

function resolvePrimaryKey(name: string, table: Table): string {
  const columns = getTableColumns(table);
  for (const [key, column] of Object.entries(columns)) {
    if (column.primary) return key;
  }
  throw new EnbiError(
    "config",
    `Collection "${name}" must register a table with a primary key column.`,
  );
}

export function collection<T extends Table>(table: T, options: CollectionOptions): Collection<T> {
  return {
    table,
    name: options.name,
    title: options.title,
    versioned: options.versioned ?? true,
    permissionsKey: options.permissionsKey ?? options.name,
    public: options.public ?? false,
    primaryKey: resolvePrimaryKey(options.name, table),
  };
}

/** Whether `action` on this collection is public (skips auth). (ADR-0019) */
export function isPublicAction(access: PublicAccess, action: PermissionAction): boolean {
  if (access === true) return true;
  if (access === false) return false;
  return access.includes(action);
}
