// @enbi/auth — native API-key auth (ADR-0020). Keys are presented as
// `x-api-key` or `Authorization: Bearer <key>`; only a SHA-256 hash is stored.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { type ApiKeysTable, type EnbiDatabase } from "@enbi/db";
import { eq } from "drizzle-orm";
import type { AuthProvider, Identity } from "./provider.ts";

export type ApiKeyRecord = {
  id: string;
  role: string;
  label: string | null;
  createdAt: string;
};

const PREFIX = "enbi_";

/** Generate a new opaque API key (show once; only its hash is stored). */
export function generateApiKey(): string {
  return PREFIX + randomBytes(32).toString("base64url");
}

/** Stable hash used as the stored/lookup value for a key. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function presentedKey(headers: Headers): string | null {
  const direct = headers.get("x-api-key");
  if (direct) return direct;
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return null;
}

export async function verifyApiKey(
  db: EnbiDatabase,
  table: ApiKeysTable,
  key: string,
): Promise<Identity | null> {
  const rows = await db
    .select()
    .from(table)
    .where(eq(table.hashedKey, hashApiKey(key)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { userId: row.id, role: row.role };
}

/** AuthProvider backed by the `_api_keys` table. */
export function apiKeyProvider(db: EnbiDatabase, table: ApiKeysTable): AuthProvider {
  return {
    authenticate(headers: Headers): Promise<Identity | null> {
      const key = presentedKey(headers);
      return key ? verifyApiKey(db, table, key) : Promise.resolve(null);
    },
  };
}

/** Mint an API key: store only its hash, return the plaintext once. */
export async function issueApiKey(
  db: EnbiDatabase,
  table: ApiKeysTable,
  options: { role: string; label?: string; now?: string },
): Promise<{ id: string; key: string }> {
  const key = generateApiKey();
  const id = randomUUID();
  await db.insert(table).values({
    id,
    hashedKey: hashApiKey(key),
    role: options.role,
    label: options.label ?? null,
    createdAt: options.now ?? new Date().toISOString(),
    lastUsedAt: null,
  });
  return { id, key };
}

/** List stored keys (metadata only — never the hash). */
export async function listApiKeys(db: EnbiDatabase, table: ApiKeysTable): Promise<ApiKeyRecord[]> {
  const rows = await db
    .select({
      id: table.id,
      role: table.role,
      label: table.label,
      createdAt: table.createdAt,
    })
    .from(table);
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    label: r.label ?? null,
    createdAt: r.createdAt,
  }));
}

/** Revoke a key by id; returns whether a key was deleted. */
export async function revokeApiKey(
  db: EnbiDatabase,
  table: ApiKeysTable,
  id: string,
): Promise<boolean> {
  const existing = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (existing.length === 0) return false;
  await db.delete(table).where(eq(table.id, id));
  return true;
}

/** Try each provider in order; first non-null identity wins. */
export function composeProviders(...providers: AuthProvider[]): AuthProvider {
  return {
    async authenticate(headers: Headers): Promise<Identity | null> {
      for (const provider of providers) {
        const identity = await provider.authenticate(headers);
        if (identity) return identity;
      }
      return null;
    },
  };
}
