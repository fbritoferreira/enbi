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

test("keys: admin can create, list, and delete via HTTP", async () => {
  const create = await app.request(
    "/api/admin_keys",
    json("admin", { role: "viewer", label: "ci" }),
  );
  expect(create.status).toBe(201);
  const { id, key } = (await create.json()) as { id: string; key: string };
  expect(key.startsWith("enbi_")).toBe(true);

  const list = (await (
    await app.request("/api/admin_keys", { headers: { "x-role": "admin" } })
  ).json()) as unknown[];
  expect(list).toHaveLength(1);

  const del = await app.request(`/api/admin_keys/${id}`, {
    method: "DELETE",
    headers: { "x-role": "admin" },
  });
  expect(del.status).toBe(204);
});

test("GET list supports limit/offset/sort/filter and sets X-Total-Count", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  for (let i = 0; i < 4; i++) {
    await ctx.db.run(sql.raw(`INSERT INTO posts (id,title,views) VALUES ('p${i}','t${i}',${i})`));
  }
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const res = await app.request("/api/posts?limit=2&sort=-views", {
    headers: { "x-role": "admin" },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("X-Total-Count")).toBe("4");
  const rows = (await res.json()) as { id: string }[];
  expect(rows.map((r) => r.id)).toEqual(["p3", "p2"]);

  const bad = await app.request("/api/posts?nope=1", { headers: { "x-role": "admin" } });
  expect(bad.status).toBe(400);
});

test("keys: viewer (read shorthand) is forbidden — admin-only", async () => {
  expect((await app.request("/api/admin_keys", { headers: { "x-role": "viewer" } })).status).toBe(
    403,
  );
  const create = await app.request("/api/admin_keys", json("viewer", { role: "viewer" }));
  expect(create.status).toBe(403);
});

test("keys: anonymous is 401, missing role is 422", async () => {
  expect((await app.request("/api/admin_keys")).status).toBe(401);
  const bad = await app.request("/api/admin_keys", json("admin", { label: "no-role" }));
  expect(bad.status).toBe(422);
});

test("creating a duplicate id is a conflict (409)", async () => {
  await app.request("/api/posts", json("editor", { id: "dup", title: "a", views: 0 }));
  const again = await app.request(
    "/api/posts",
    json("editor", { id: "dup", title: "b", views: 0 }),
  );
  expect(again.status).toBe(409);
});

test("listRows paginates, sorts, and filters", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  const { listRows, countRows } = await import("../src/crud.ts");
  for (let i = 0; i < 5; i++) {
    await ctx.db.run(sql.raw(`INSERT INTO posts (id,title,views) VALUES ('p${i}','t${i}',${i})`));
  }
  const page = await listRows(ctx.db, posts, {
    limit: 2,
    offset: 1,
    sort: { column: "views", dir: "desc" },
  });
  expect(page.map((r) => r.id)).toEqual(["p3", "p2"]);
  const filtered = await listRows(ctx.db, posts, { filters: [{ column: "title", value: "t4" }] });
  expect(filtered).toHaveLength(1);
  expect(await countRows(ctx.db, posts, [{ column: "title", value: "t4" }])).toBe(1);
});

test("listRows rejects an unknown column", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  const { listRows } = await import("../src/crud.ts");
  await expect(
    listRows(ctx.db, posts, { filters: [{ column: "nope", value: "x" }] }),
  ).rejects.toMatchObject({
    code: "validation",
  });
});

test("CORS headers are sent only when admin.origin is configured", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const base = {
    db: { dialect: "sqlite" as const, url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*" as const },
    collections: [collection(posts, { name: "posts", public: ["read"] as const })],
  };

  const withCors = await createServer(
    { ...base, admin: { origin: "http://localhost:4321" } },
    { db: ctx, authProvider: stubAuth },
  );
  const r = await withCors.request("/api/posts", { headers: { origin: "http://localhost:4321" } });
  expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:4321");
  expect(r.headers.get("access-control-allow-credentials")).toBe("true");

  const pre = await withCors.request("/api/posts", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:4321", "access-control-request-method": "POST" },
  });
  expect(pre.status === 204 || pre.status === 200).toBe(true);

  const ctx2 = await createDb({ dialect: "sqlite", url: ":memory:" });
  const noCors = await createServer(base, { db: ctx2, authProvider: stubAuth });
  const r2 = await noCors.request("/api/posts", { headers: { origin: "http://localhost:4321" } });
  expect(r2.headers.get("access-control-allow-origin")).toBeNull();
});

test("GET /api/admin_collections returns metadata, admin-only", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*", viewer: "read" },
      collections: [collection(posts, { name: "posts", title: "title" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const ok = await app.request("/api/admin_collections", { headers: { "x-role": "admin" } });
  expect(ok.status).toBe(200);
  const meta = (await ok.json()) as {
    name: string;
    primaryKey: string;
    columns: { name: string }[];
  }[];
  const posts0 = meta.find((m) => m.name === "posts");
  expect(posts0?.primaryKey).toBe("id");
  expect(posts0?.columns.map((col) => col.name).sort()).toEqual(["id", "title", "views"]);

  // viewer (read shorthand) is NOT admin → 403
  const denied = await app.request("/api/admin_collections", { headers: { "x-role": "viewer" } });
  expect(denied.status).toBe(403);
});
