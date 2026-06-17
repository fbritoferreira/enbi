import {
  apiKeyProvider,
  type AuthProvider,
  composeProviders,
  generateApiKey,
  hashApiKey,
} from "@enbi/auth";
import { collection, createDb, defineEnbiConfig, type EnbiDb } from "@enbi/db";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { beforeEach, expect, test } from "vite-plus/test";
import { createServer } from "../src/index.ts";

const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  views: integer("views").notNull(),
});
const pages = sqliteTable("pages", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
});

// Stub auth: the `x-role` header is the caller's role; absent → anonymous.
const stubAuth: AuthProvider = {
  authenticate(headers) {
    const role = headers.get("x-role");
    return Promise.resolve(role ? { userId: `u-${role}`, role } : null);
  },
};

async function buildApp(ctx: EnbiDb) {
  const config = defineEnbiConfig({
    db: { dialect: "sqlite", url: ":memory:" },
    auth: { secret: "x" },
    roles: {
      admin: "*",
      editor: { posts: ["read", "create", "update"] },
      viewer: "read",
    },
    collections: [
      collection(posts, { name: "posts", title: "title" }),
      collection(pages, { name: "pages", public: ["read"] }),
    ],
  });
  // Real API-key provider tried first, then the role-header stub.
  const authProvider = composeProviders(apiKeyProvider(ctx.db, ctx.apiKeys), stubAuth);
  return createServer(config, { db: ctx, authProvider });
}

let app: Awaited<ReturnType<typeof buildApp>>;
let ctx: EnbiDb;

beforeEach(async () => {
  ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text PRIMARY KEY, title text NOT NULL, views integer NOT NULL)`,
  );
  await ctx.db.run(sql`CREATE TABLE pages (id text PRIMARY KEY, body text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  app = await buildApp(ctx);
});

const json = (role: string | null, body?: unknown): RequestInit => ({
  method: body === undefined ? "GET" : "POST",
  headers: {
    "content-type": "application/json",
    ...(role ? { "x-role": role } : {}),
  },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

test("GET /health", async () => {
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("anonymous cannot create a post (401)", async () => {
  const res = await app.request("/api/posts", json(null, { id: "p1", title: "x", views: 0 }));
  expect(res.status).toBe(401);
});

test("viewer is forbidden from creating (403)", async () => {
  const res = await app.request("/api/posts", json("viewer", { id: "p1", title: "x", views: 0 }));
  expect(res.status).toBe(403);
});

test("editor can create; everyone-with-read can read", async () => {
  const create = await app.request(
    "/api/posts",
    json("editor", { id: "p1", title: "Hello", views: 1 }),
  );
  expect(create.status).toBe(201);

  const list = await app.request("/api/posts", { headers: { "x-role": "viewer" } });
  expect(list.status).toBe(200);
  expect((await list.json()) as unknown[]).toHaveLength(1);
});

test("public collection is readable without auth, but writes are still gated", async () => {
  // No x-role header at all → public read works because pages marks read public.
  await ctx.db.run(sql`INSERT INTO pages (id, body) VALUES ('home', 'hi')`);
  const read = await app.request("/api/pages/home");
  expect(read.status).toBe(200);
  expect(((await read.json()) as { body: string }).body).toBe("hi");

  const write = await app.request("/api/pages", json(null, { id: "x", body: "y" }));
  expect(write.status).toBe(401);
});

test("versioning: update creates revisions; restore brings back an old snapshot", async () => {
  await app.request("/api/posts", json("editor", { id: "p1", title: "v1", views: 0 }));
  await app.request("/api/posts/p1", {
    ...json("editor", { title: "v2", views: 5 }),
    method: "PUT",
  });

  const revs = (await (
    await app.request("/api/posts/p1/revisions", { headers: { "x-role": "admin" } })
  ).json()) as unknown[];
  expect(revs.length).toBe(2);

  const restore = await app.request("/api/posts/p1/restore", json("admin", { version: 1 }));
  expect(restore.status).toBe(200);
  expect(((await restore.json()) as { title: string }).title).toBe("v1");
});

test("an API key authenticates and carries its role through the server", async () => {
  const key = generateApiKey();
  await ctx.db.run(
    sql`INSERT INTO _api_keys (id, hashed_key, role, created_at) VALUES ('k1', ${hashApiKey(key)}, 'editor', 't0')`,
  );
  // No x-role header — auth comes purely from the API key (editor → can create).
  const res = await app.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({ id: "p1", title: "via-key", views: 0 }),
  });
  expect(res.status).toBe(201);

  const bad = await app.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "enbi_wrong" },
    body: JSON.stringify({ id: "p2", title: "x", views: 0 }),
  });
  expect(bad.status).toBe(401);
});

test("admin can delete", async () => {
  await app.request("/api/posts", json("editor", { id: "p1", title: "x", views: 0 }));
  const del = await app.request("/api/posts/p1", {
    method: "DELETE",
    headers: { "x-role": "admin" },
  });
  expect(del.status).toBe(204);
  const after = await app.request("/api/posts/p1", { headers: { "x-role": "viewer" } });
  expect(after.status).toBe(404);
});
