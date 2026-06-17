// @enbi/auth — native API-key auth (ADR-0020). Keys are presented as
// `x-api-key` or `Authorization: Bearer <key>`; only a SHA-256 hash is stored.
import { createHash, randomBytes } from "node:crypto";
import { type ApiKeysTable, type EnbiDatabase } from "@enbi/db";
import { eq } from "drizzle-orm";
import type { AuthProvider, Identity } from "./provider.ts";

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
