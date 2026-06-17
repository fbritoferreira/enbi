import { createDb } from "@enbi/db";
import { sql } from "drizzle-orm";
import { expect, test } from "vite-plus/test";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  apiKeyProvider,
  authSchema,
  betterAuthProvider,
  can,
  composeProviders,
  createAuth,
  generateApiKey,
  hashApiKey,
  type RolesConfig,
} from "../src/index.ts";

const roles: RolesConfig = {
  admin: "*",
  editor: { posts: ["read", "create", "update"], media: ["read"] },
  viewer: "read",
  public: { posts: ["read"] },
};

test("admin can do everything", () => {
  expect(can(roles, "admin", "posts", "delete")).toBe(true);
  expect(can(roles, "admin", "anything", "create")).toBe(true);
});

test("editor is limited to its per-collection actions", () => {
  expect(can(roles, "editor", "posts", "update")).toBe(true);
  expect(can(roles, "editor", "posts", "delete")).toBe(false);
  expect(can(roles, "editor", "media", "create")).toBe(false);
  expect(can(roles, "editor", "media", "read")).toBe(true);
});

test("viewer (read shorthand) reads anything, writes nothing", () => {
  expect(can(roles, "viewer", "posts", "read")).toBe(true);
  expect(can(roles, "viewer", "posts", "create")).toBe(false);
});

test("public role grants only its configured actions", () => {
  expect(can(roles, "public", "posts", "read")).toBe(true);
  expect(can(roles, "public", "posts", "create")).toBe(false);
  expect(can(roles, "public", "media", "read")).toBe(false);
});

test("unknown or missing role is denied", () => {
  expect(can(roles, "ghost", "posts", "read")).toBe(false);
  expect(can(roles, null, "posts", "read")).toBe(false);
  expect(can(roles, undefined, "posts", "read")).toBe(false);
});

test("api key: generated keys are opaque and hash stably", () => {
  const key = generateApiKey();
  expect(key.startsWith("enbi_")).toBe(true);
  expect(hashApiKey(key)).toBe(hashApiKey(key));
  expect(hashApiKey(key)).not.toBe(key);
});

test("apiKeyProvider authenticates a stored key via x-api-key and Bearer", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const key = generateApiKey();
  await ctx.db.insert(ctx.apiKeys).values({
    id: "k1",
    hashedKey: hashApiKey(key),
    role: "editor",
    label: "ci",
    createdAt: "2026-06-17T00:00:00.000Z",
    lastUsedAt: null,
  });

  const provider = apiKeyProvider(ctx.db, ctx.apiKeys);
  const viaHeader = await provider.authenticate(new Headers({ "x-api-key": key }));
  expect(viaHeader).toEqual({ userId: "k1", role: "editor" });
  const viaBearer = await provider.authenticate(new Headers({ authorization: `Bearer ${key}` }));
  expect(viaBearer?.role).toBe("editor");

  expect(await provider.authenticate(new Headers({ "x-api-key": "wrong" }))).toBeNull();
  expect(await provider.authenticate(new Headers())).toBeNull();
});

test("composeProviders returns the first matching identity", async () => {
  const never = { authenticate: () => Promise.resolve(null) };
  const yes = { authenticate: () => Promise.resolve({ userId: "u1", role: "admin" }) };
  const composed = composeProviders(never, yes);
  expect(await composed.authenticate(new Headers())).toEqual({ userId: "u1", role: "admin" });
});

test("authSchema produces drizzle tables for better-auth's models", () => {
  const schema = authSchema({ secret: "x" }, "sqlite");
  // Core better-auth tables exist.
  for (const t of ["user", "session", "account", "verification"]) {
    expect(schema[t]).toBeDefined();
  }
  const user = getTableConfig(schema.user as never);
  const columns = user.columns.map((c) => c.name);
  expect(columns).toContain("id");
  expect(columns).toContain("email");
  // admin plugin adds a `role` field to user.
  expect(columns).toContain("role");
});

test("createAuth boots a better-auth instance with a handler", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const auth = createAuth(ctx, { secret: "test-secret-value-1234567890" });
  expect(typeof auth.handler).toBe("function");
  expect(auth.api).toBeDefined();
  // The provider adapter exposes authenticate().
  const provider = betterAuthProvider(auth);
  expect(typeof provider.authenticate).toBe("function");
});
