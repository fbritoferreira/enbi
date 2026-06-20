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

/**
 * Per-field validation rule for a collection (ADR-0049).
 * All fields are optional; absent rules mean "no constraint".
 */
export type FieldRule = {
  /** Field must be present and non-null/undefined/empty-string. */
  required?: boolean;
  /**
   * Expected value type.
   * - "string" → typeof === "string"
   * - "number" → Number.isFinite(Number(v)) (accepts numeric strings)
   * - "boolean" → strict true/false
   * - "email" → basic email regex
   * - "url" → parseable by new URL()
   */
  type?: "string" | "number" | "boolean" | "email" | "url";
  /** For strings: minimum length; for numbers: minimum value. */
  min?: number;
  /** For strings: maximum length; for numbers: maximum value. */
  max?: number;
  /** Regex source string tested against the string value of the field. */
  pattern?: string;
  /** Allowed values (compared as strings). */
  enum?: string[];
};

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
  /**
   * Enable draft/publish for this collection (ADR-0045). When truthy the table
   * MUST have the named status column (a text column). Public callers only see
   * rows where that column equals "published"; creates default to "draft".
   * `true` uses column name "status". An object `{ column: "my_col" }` overrides.
   */
  drafts?: boolean | { column?: string };
  /**
   * Declare FK relations on this collection. Keys are the JS property name of
   * the column that holds the target row's primary key; values name the target
   * collection. Used by the server's `?expand` query parameter.
   */
  relations?: Record<string, { collection: string }>;
  /**
   * Per-field validation rules applied on create and update (ADR-0049).
   * Keys are field names; values are FieldRule objects.
   * Defaults to {} (no validation).
   */
  validate?: Record<string, FieldRule>;
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
  /**
   * Draft/publish configuration. `false` means disabled. When truthy the named
   * column controls visibility: `"published"` rows are public; all others are
   * drafts. (ADR-0045)
   */
  drafts: { column: string } | false;
  /**
   * FK relations declared on this collection. Keys are the JS property name of
   * the column holding the target row's PK; values name the target collection.
   */
  relations: Record<string, { collection: string }>;
  /**
   * Per-field validation rules applied on create and update (ADR-0049).
   * Defaults to {} (no validation).
   */
  validate: Record<string, FieldRule>;
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
  if (options.name.startsWith("admin_")) {
    // Reserved namespace for system routes like /api/admin_auth (ADR-0033).
    throw new EnbiError(
      "config",
      `Collection name "${options.name}" must not start with "admin_".`,
    );
  }
  function normalizeDrafts(
    raw: boolean | { column?: string } | undefined,
  ): { column: string } | false {
    if (!raw) return false;
    if (raw === true) return { column: "status" };
    return { column: raw.column ?? "status" };
  }

  return {
    table,
    name: options.name,
    title: options.title,
    versioned: options.versioned ?? true,
    permissionsKey: options.permissionsKey ?? options.name,
    public: options.public ?? false,
    primaryKey: resolvePrimaryKey(options.name, table),
    drafts: normalizeDrafts(options.drafts),
    relations: options.relations ?? {},
    validate: options.validate ?? {},
  };
}

/** Whether `action` on this collection is public (skips auth). (ADR-0019) */
export function isPublicAction(access: PublicAccess, action: PermissionAction): boolean {
  if (access === true) return true;
  if (access === false) return false;
  return access.includes(action);
}
