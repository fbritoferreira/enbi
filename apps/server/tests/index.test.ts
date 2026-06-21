import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import {
  apiKeyProvider,
  authSchema,
  type AuthProvider,
  composeProviders,
  generateApiKey,
  hashApiKey,
} from "@enbi/auth";
import { collection, createDb, defineEnbiConfig, type EnbiDb } from "@enbi/db";
import { overlayTranslations, readTranslations, writeTranslations } from "../src/i18n.ts";
import { validateFields } from "../src/validate.ts";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
import { createServer } from "../src/index.ts";
import type { WebhookDelivery } from "../src/webhooks.ts";

const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  views: integer("views").notNull(),
});
const pages = sqliteTable("pages", {
  id: text("id").primaryKey(),
  body: text("body").notNull(),
});
const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
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
  await ctx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
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
  const filtered = await listRows(ctx.db, posts, {
    filters: [{ column: "title", op: "eq", value: "t4" }],
  });
  expect(filtered).toHaveLength(1);
  expect(await countRows(ctx.db, posts, [{ column: "title", op: "eq", value: "t4" }])).toBe(1);
});

test("listRows rejects an unknown column", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  const { listRows } = await import("../src/crud.ts");
  await expect(
    listRows(ctx.db, posts, { filters: [{ column: "nope", op: "eq", value: "x" }] }),
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

// ── Richer Query tests (TDD: written before implementation) ──────────────────

test("richer query: like operator matches substring (?title__like=ell)", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','hello',1)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p2','world',2)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p3','yellow',3)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const res = await app.request("/api/posts?title__like=ell", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.map((r) => r.id).sort()).toEqual(["p1", "p3"]);
  expect(res.headers.get("X-Total-Count")).toBe("2");
});

test("richer query: gte operator filters rows (?views__gte=2)", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','a',1)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p2','b',2)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p3','c',3)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const res = await app.request("/api/posts?views__gte=2", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.map((r) => r.id).sort()).toEqual(["p2", "p3"]);
});

test("richer query: ne operator excludes matching rows (?views__ne=2)", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','a',1)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p2','b',2)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p3','c',3)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const res = await app.request("/api/posts?views__ne=2", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.map((r) => r.id).sort()).toEqual(["p1", "p3"]);
});

test("richer query: in operator matches rows with IDs in comma list (?id__in=p1,p3)", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','a',1)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p2','b',2)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p3','c',3)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const res = await app.request("/api/posts?id__in=p1,p3", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.map((r) => r.id).sort()).toEqual(["p1", "p3"]);
});

test("richer query: _match=any applies OR semantics across filters", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','foxhunt',99)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p2','normal',1)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p3','extreme',200)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  // OR: title contains "fox" OR views >= 200 → p1 and p3
  const res = await app.request("/api/posts?title__like=fox&views__gte=200&_match=any", {
    headers: { "x-role": "admin" },
  });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.map((r) => r.id).sort()).toEqual(["p1", "p3"]);
});

test("richer query: cursor pagination returns next page and X-Next-Cursor on full page", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  // Insert 4 rows with pk-ordered IDs
  for (const [id, title, views] of [
    ["p1", "a", 1],
    ["p2", "b", 2],
    ["p3", "c", 3],
    ["p4", "d", 4],
  ]) {
    await ctx.db.run(sql.raw(`INSERT INTO posts VALUES ('${id}','${title}',${views})`));
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

  // First page: no cursor, limit=2 → p1,p2 with X-Next-Cursor=p2 (full page)
  const page1 = await app.request("/api/posts?limit=2", { headers: { "x-role": "admin" } });
  expect(page1.status).toBe(200);
  const rows1 = (await page1.json()) as { id: string }[];
  expect(rows1.map((r) => r.id)).toEqual(["p1", "p2"]);
  // No cursor provided for first page → no X-Next-Cursor (offset mode)
  // (the header is only set when cursor param is used)

  // Second page: cursor=p2, limit=2 → p3,p4 with X-Next-Cursor=p4 (full page)
  const page2 = await app.request("/api/posts?limit=2&cursor=p2", {
    headers: { "x-role": "admin" },
  });
  expect(page2.status).toBe(200);
  const rows2 = (await page2.json()) as { id: string }[];
  expect(rows2.map((r) => r.id)).toEqual(["p3", "p4"]);
  expect(page2.headers.get("X-Next-Cursor")).toBe("p4");

  // Third page: cursor=p4, limit=2 → no rows, no X-Next-Cursor
  const page3 = await app.request("/api/posts?limit=2&cursor=p4", {
    headers: { "x-role": "admin" },
  });
  expect(page3.status).toBe(200);
  const rows3 = (await page3.json()) as { id: string }[];
  expect(rows3).toHaveLength(0);
  expect(page3.headers.get("X-Next-Cursor")).toBeNull();
});

test("richer query: unknown operator returns 400 (?title__zzz=x)", async () => {
  const res = await app.request("/api/posts?title__zzz=x", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(400);
});

test("richer query: backward compat — plain ?field=value still means eq", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','hello',1)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p2','world',2)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const res = await app.request("/api/posts?title=hello", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("p1");
  expect(res.headers.get("X-Total-Count")).toBe("1");
});

// ── Security / correctness fixes ─────────────────────────────────────────────

test("fix: negative limit clamps to 0 — returns [] but still reports total", async () => {
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','a',1)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p2','b',2)`);
  const res = await app.request("/api/posts?limit=-5", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as unknown[];
  expect(rows).toEqual([]);
  expect(res.headers.get("X-Total-Count")).toBe("2");
});

test("fix: CORS exposeHeaders includes both X-Total-Count and X-Next-Cursor", async () => {
  const corsCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await corsCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await corsCtx.db.run(sql`CREATE TABLE pages (id text PRIMARY KEY, body text NOT NULL)`);
  await corsCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await corsCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const withCors = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts", public: ["read"] as const })],
      admin: { origin: "http://localhost:4321" },
    },
    { db: corsCtx, authProvider: stubAuth },
  );
  const res = await withCors.request("/api/posts", {
    headers: { origin: "http://localhost:4321" },
  });
  expect(res.status).toBe(200);
  const expose = res.headers.get("access-control-expose-headers") ?? "";
  expect(expose).toContain("X-Total-Count");
  expect(expose).toContain("X-Next-Cursor");
});

test("fix: cursor without limit defaults to 100 — returns rows, not unbounded", async () => {
  for (let i = 0; i < 5; i++) {
    await ctx.db.run(sql.raw(`INSERT INTO posts (id,title,views) VALUES ('p${i}','t${i}',${i})`));
  }
  // cursor=p0 without limit → should return the 4 remaining rows (p1..p4), bounded at ≤100
  const res = await app.request("/api/posts?cursor=p0", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThanOrEqual(100);
  expect(res.headers.get("X-Total-Count")).toBe("5");
});

test("fix: more than 50 filters returns 400 with 'Too many filters' message", async () => {
  // Build 51 distinct filter params: a0__eq=x ... a50__eq=x
  const params = Array.from({ length: 51 }, (_, i) => `a${i}__eq=x`).join("&");
  const res = await app.request(`/api/posts?${params}`, { headers: { "x-role": "admin" } });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("Too many filters (max 50).");
});

test("fix: in-filter with >100 items returns 400 with correct message", async () => {
  const items = Array.from({ length: 101 }, (_, i) => `v${i}`).join(",");
  const res = await app.request(`/api/posts?id__in=${items}`, { headers: { "x-role": "admin" } });
  expect(res.status).toBe(400);
  const body = (await res.json()) as { message: string };
  expect(body.message).toBe("Too many values in 'in' filter (max 100).");
});

// ── GET /api/admin_providers ─────────────────────────────────────────────────

test("GET /api/admin_providers returns social and sso provider ids", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: {
        secret: "x",
        social: { github: { clientId: "gh-id", clientSecret: "gh-secret" } },
        ssoProviders: [
          {
            providerId: "mock",
            clientId: "mock-id",
            clientSecret: "mock-secret",
            authorizationUrl: "https://mock.example/oauth/authorize",
            tokenUrl: "https://mock.example/oauth/token",
          },
        ],
      },
      roles: { admin: "*" },
      collections: [],
    },
    { db: ctx, authProvider: stubAuth },
  );

  const res = await app.request("/api/admin_providers");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { social: string[]; sso: string[] };
  expect(body.social).toEqual(["github"]);
  expect(body.sso).toEqual(["mock"]);
});

test("GET /api/admin_providers returns empty arrays when no social/sso configured", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [],
    },
    { db: ctx, authProvider: stubAuth },
  );

  const res = await app.request("/api/admin_providers");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { social: string[]; sso: string[] };
  expect(body.social).toEqual([]);
  expect(body.sso).toEqual([]);
});

test("GET /api/admin_providers is accessible without authentication", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: {
        secret: "x",
        social: { google: { clientId: "g-id", clientSecret: "g-secret" } },
      },
      roles: { admin: "*" },
      collections: [],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // No headers at all — no x-role, no x-api-key, no Authorization
  const res = await app.request("/api/admin_providers");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { social: string[]; sso: string[] };
  expect(body.social).toEqual(["google"]);
  expect(body.sso).toEqual([]);
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
  const payload = (await ok.json()) as {
    name: string;
    primaryKey: string;
    columns: { name: string }[];
    locales: string[];
    defaultLocale: string | null;
  }[];
  expect(Array.isArray(payload)).toBe(true);
  const posts0 = payload.find((m) => m.name === "posts");
  expect(posts0?.primaryKey).toBe("id");
  expect(posts0?.columns.map((col) => col.name).sort()).toEqual(["id", "title", "views"]);
  expect(posts0?.locales).toEqual([]);
  expect(posts0?.defaultLocale).toBeNull();

  // viewer (read shorthand) is NOT admin → 403
  const denied = await app.request("/api/admin_collections", { headers: { "x-role": "viewer" } });
  expect(denied.status).toBe(403);
});

// ── widgets field option ──────────────────────────────────────────────────────

test("GET /api/admin_collections: widgets field present on each entry (array payload)", async () => {
  // A collection with widgets: { body: "wysiwyg" }
  const localPages = sqliteTable("local_pages", {
    id: text("id").primaryKey(),
    body: text("body").notNull(),
  });
  const ctx2 = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx2.db.run(sql`CREATE TABLE local_pages (id text PRIMARY KEY, body text NOT NULL)`);
  await ctx2.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx2.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await ctx2.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  const app2 = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(localPages, { name: "local_pages", widgets: { body: "wysiwyg" } }),
        collection(posts, { name: "posts" }),
      ],
    },
    { db: ctx2, authProvider: stubAuth },
  );

  const res = await app2.request("/api/admin_collections", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(200);
  const payload = (await res.json()) as { name: string; widgets: Record<string, string> }[];

  // Must still be an array
  expect(Array.isArray(payload)).toBe(true);

  // Collection with explicit widgets: { body: "wysiwyg" }
  const pagesMeta = payload.find((m) => m.name === "local_pages");
  expect(pagesMeta?.widgets).toEqual({ body: "wysiwyg" });

  // Collection without widgets → empty object
  const postsMeta = payload.find((m) => m.name === "posts");
  expect(postsMeta?.widgets).toEqual({});
});

// ── GET /api/admin_setup — first-run detection ────────────────────────────────

test("GET /api/admin_setup: needsSetup=true with 0 users, needsSetup=false after inserting a user", async () => {
  const authConfig = { secret: "test-secret-setup" };
  const setupCtx = await createDb({ dialect: "sqlite", url: ":memory:" });

  // Create the system tables the server and auth layer need.
  await setupCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await setupCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await setupCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);

  // mountSetup queries the `user` table from authSchema. Create it so the
  // count query succeeds. We use the drizzle table columns to build the DDL.
  // The minimal columns needed for a count are just id + name + email.
  await setupCtx.db.run(sql`CREATE TABLE "user" (
    id text PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" integer NOT NULL,
    image text,
    "createdAt" integer NOT NULL,
    "updatedAt" integer NOT NULL,
    role text,
    banned integer,
    "banReason" text,
    "banExpires" integer
  )`);

  const setupApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: authConfig,
      roles: { admin: "*" },
      collections: [],
    },
    { db: setupCtx, authProvider: stubAuth },
  );

  // Before any user exists → needsSetup: true
  const before = await setupApp.request("/api/admin_setup");
  expect(before.status).toBe(200);
  const beforeBody = (await before.json()) as { needsSetup: boolean };
  expect(beforeBody.needsSetup).toBe(true);

  // Insert a user row directly (reliable — no network/better-auth table deps).
  // We use the drizzle userTable from authSchema so we go through the ORM,
  // exactly mirroring how mountSetup counts rows.
  const userTable = authSchema(authConfig, setupCtx.dialect).user;
  await setupCtx.db.insert(userTable as never).values({
    id: "u1",
    name: "Admin",
    email: "admin@example.com",
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);

  // After inserting one user → needsSetup: false
  const after = await setupApp.request("/api/admin_setup");
  expect(after.status).toBe(200);
  const afterBody = (await after.json()) as { needsSetup: boolean };
  expect(afterBody.needsSetup).toBe(false);
});

// ── Media tests ──────────────────────────────────────────────────────────────

let mediaDir: string;

beforeEach(() => {
  mediaDir = mkdtempSync(joinPath(tmpdir(), "enbi-media-"));
});

afterEach(() => {
  rmSync(mediaDir, { recursive: true, force: true });
});

async function buildMediaApp(ctx: EnbiDb) {
  const config = defineEnbiConfig({
    db: { dialect: "sqlite", url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*" },
    collections: [],
    media: { dir: mediaDir },
  });
  return createServer(config, { db: ctx, authProvider: stubAuth });
}

test("media: anonymous POST → 401", async () => {
  const mediaCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await mediaCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await mediaCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  const app = await buildMediaApp(mediaCtx);

  const form = new FormData();
  form.append("file", new Blob(["hello"], { type: "text/plain" }), "test.txt");
  const res = await app.request("/api/admin_media", { method: "POST", body: form });
  expect(res.status).toBe(401);
});

test("media: roundtrip — upload, list, serve, delete", async () => {
  const mediaCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await mediaCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await mediaCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  const app = await buildMediaApp(mediaCtx);

  // Upload
  const form = new FormData();
  form.append("file", new Blob(["hello world"], { type: "text/plain" }), "hello.txt");
  const upload = await app.request("/api/admin_media", {
    method: "POST",
    body: form,
    headers: { "x-role": "admin" },
  });
  expect(upload.status).toBe(201);
  const { id, url, filename, mime } = (await upload.json()) as {
    id: string;
    url: string;
    filename: string;
    mime: string;
    size: number;
  };
  expect(id).toBeTruthy();
  expect(url).toBe(`/api/media/${id}`);
  expect(filename).toBe("hello.txt");
  expect(mime).toBe("text/plain");

  // List
  const list = await app.request("/api/admin_media", { headers: { "x-role": "admin" } });
  expect(list.status).toBe(200);
  const rows = (await list.json()) as { id: string }[];
  expect(rows.some((r) => r.id === id)).toBe(true);

  // Serve (public — no auth header)
  const serve = await app.request(`/api/media/${id}`);
  expect(serve.status).toBe(200);
  expect(serve.headers.get("content-type")).toBe("text/plain");
  // Exact-bytes check: must equal uploaded payload precisely (not Buffer pool garbage)
  const buf = new Uint8Array(await serve.arrayBuffer());
  expect(buf.byteLength).toBe(11); // "hello world".length === 11
  expect(new TextDecoder().decode(buf)).toBe("hello world");

  // Delete
  const del = await app.request(`/api/admin_media/${id}`, {
    method: "DELETE",
    headers: { "x-role": "admin" },
  });
  expect(del.status).toBe(204);

  // Serve after delete → 404
  const gone = await app.request(`/api/media/${id}`);
  expect(gone.status).toBe(404);
});

test("media: POST without file → 400", async () => {
  const mediaCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await mediaCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await mediaCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  const app = await buildMediaApp(mediaCtx);

  const form = new FormData();
  // no file field
  const res = await app.request("/api/admin_media", {
    method: "POST",
    body: form,
    headers: { "x-role": "admin" },
  });
  expect(res.status).toBe(422);
});

test("media: DELETE non-existent → 404", async () => {
  const mediaCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await mediaCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await mediaCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  const app = await buildMediaApp(mediaCtx);

  const res = await app.request("/api/admin_media/does-not-exist", {
    method: "DELETE",
    headers: { "x-role": "admin" },
  });
  expect(res.status).toBe(404);
});

// ── Drafts / publish tests (TDD) ─────────────────────────────────────────────

test("drafts: public list sees only published rows", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE articles (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a1','Hello','published')`);
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a2','Draft one','draft')`);
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a3','Also published','published')`);
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(articles, { name: "articles", drafts: true, public: ["read"] as const }),
      ],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // Public (no x-role) → only published
  const pub = await app.request("/api/articles");
  expect(pub.status).toBe(200);
  const pubRows = (await pub.json()) as { id: string }[];
  expect(pubRows.map((r) => r.id).sort()).toEqual(["a1", "a3"]);
  expect(pub.headers.get("X-Total-Count")).toBe("2");

  // Admin → sees all 3
  const adm = await app.request("/api/articles", { headers: { "x-role": "admin" } });
  expect(adm.status).toBe(200);
  const admRows = (await adm.json()) as { id: string }[];
  expect(admRows.map((r) => r.id).sort()).toEqual(["a1", "a2", "a3"]);
  expect(adm.headers.get("X-Total-Count")).toBe("3");
});

test("drafts: public GET of a draft row returns 404; admin sees it", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE articles (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a1','Draft','draft')`);
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(articles, { name: "articles", drafts: true, public: ["read"] as const }),
      ],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // Public → 404 for a draft
  const pub = await app.request("/api/articles/a1");
  expect(pub.status).toBe(404);

  // Admin → 200
  const adm = await app.request("/api/articles/a1", { headers: { "x-role": "admin" } });
  expect(adm.status).toBe(200);
  expect(((await adm.json()) as { title: string }).title).toBe("Draft");
});

test("drafts: POST without status (admin) defaults to draft; public list excludes it", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE articles (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(articles, { name: "articles", drafts: true, public: ["read"] as const }),
      ],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // POST without status field → defaults to draft
  const create = await app.request("/api/articles", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "a1", title: "New article" }),
  });
  expect(create.status).toBe(201);
  const created = (await create.json()) as { status: string };
  expect(created.status).toBe("draft");

  // Public list: draft is hidden
  const pub = await app.request("/api/articles");
  expect(pub.status).toBe(200);
  const rows = (await pub.json()) as unknown[];
  expect(rows).toHaveLength(0);
  expect(pub.headers.get("X-Total-Count")).toBe("0");
});

test("drafts: _match=any does not leak draft rows to public callers", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE articles (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a1','Hello','published')`);
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a2','Draft','draft')`);
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(articles, { name: "articles", drafts: true, public: ["read"] as const }),
      ],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // Public caller with _match=any must NOT see the draft row.
  // The server forces match="all" for public callers on drafts collections, so
  // all user filters are AND-ed together with the mandatory status=published gate.
  // A filter of status__ne=published combined (AND) with status__eq=published
  // matches nothing — so no rows are returned at all, and critically the draft
  // (a2) is not exposed.
  const res = await app.request("/api/articles?status__ne=published&_match=any");
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string }[];
  // Draft must not leak — the entire point of this test.
  expect(rows.map((r) => r.id)).not.toContain("a2");
  // Total reflects the AND-filtered result (no rows match both constraints)
  expect(res.headers.get("X-Total-Count")).toBe("0");
});

test("drafts: public caller cannot access revisions of a draft entry", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE articles (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a1','Draft entry','draft')`);
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(articles, { name: "articles", drafts: true, public: ["read"] as const }),
      ],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // Public caller → 404 on revisions of a draft entry
  const pub = await app.request("/api/articles/a1/revisions");
  expect(pub.status).toBe(404);

  // Admin → can access revisions
  const adm = await app.request("/api/articles/a1/revisions", { headers: { "x-role": "admin" } });
  expect(adm.status).toBe(200);
});

test("drafts: non-drafts collection is unaffected — no status filtering", async () => {
  // The existing `posts` collection has no drafts option.
  // Insert a row and verify the public (no-auth, but posts requires auth via admin role)
  // and admin get it unfiltered.
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','hello',1)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );

  const adm = await app.request("/api/posts", { headers: { "x-role": "admin" } });
  expect(adm.status).toBe(200);
  const rows = (await adm.json()) as { id: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("p1");
});

test("fix: auth provider that throws is treated as anonymous — public reads return 200, not 500", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE articles (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a1','Published','published')`);
  await ctx.db.run(sql`INSERT INTO articles VALUES ('a2','Draft','draft')`);
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);

  // Auth provider that always rejects — simulates a broken/unavailable provider.
  const brokenAuth: AuthProvider = {
    authenticate() {
      return Promise.reject(new Error("auth service unavailable"));
    },
  };

  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(articles, { name: "articles", drafts: true, public: ["read"] as const }),
      ],
    },
    { db: ctx, authProvider: brokenAuth },
  );

  // Public read must succeed (200) — broken auth provider falls back to anonymous.
  const res = await app.request("/api/articles");
  expect(res.status).toBe(200);
  // Only published rows visible (anonymous = PUBLIC_ROLE → draft gate applies).
  const rows = (await res.json()) as { id: string }[];
  expect(rows.map((r) => r.id)).toEqual(["a1"]);
  expect(res.headers.get("X-Total-Count")).toBe("1");
});

test("fix: POST with status: null defaults to draft, not leaked as null", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE articles (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(articles, { name: "articles", drafts: true, public: ["read"] as const }),
      ],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // POST with an explicit null status — must be coerced to "draft".
  const create = await app.request("/api/articles", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "a1", title: "Null-status article", status: null }),
  });
  expect(create.status).toBe(201);
  const created = (await create.json()) as { status: string };
  expect(created.status).toBe("draft");

  // Public list should not see the row (it is a draft).
  const pub = await app.request("/api/articles");
  expect(pub.status).toBe(200);
  const rows = (await pub.json()) as unknown[];
  expect(rows).toHaveLength(0);
  expect(pub.headers.get("X-Total-Count")).toBe("0");
});

// ── Relations / expand tests (TDD) ───────────────────────────────────────────

test("relations: expand=authorId on single row returns _expanded.authorId", async () => {
  const authorsTable = sqliteTable("authors", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
  });
  const postsWithAuthor = sqliteTable("posts_with_author", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    authorId: text("author_id"),
  });
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(sql`CREATE TABLE authors (id text PRIMARY KEY, name text NOT NULL)`);
  await ctx.db.run(
    sql`CREATE TABLE posts_with_author (id text PRIMARY KEY, title text NOT NULL, author_id text)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );
  await ctx.db.run(sql`INSERT INTO authors VALUES ('a1', 'Alice')`);
  await ctx.db.run(sql`INSERT INTO posts_with_author VALUES ('p1', 'Hello', 'a1')`);

  const colAuthors = collection(authorsTable, { name: "authors" });
  const colPosts = collection(postsWithAuthor, {
    name: "posts_with_author",
    relations: { authorId: { collection: "authors" } },
  });
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [colPosts, colAuthors],
    },
    { db: ctx, authProvider: stubAuth },
  );

  const res = await app.request("/api/posts_with_author/p1?expand=authorId", {
    headers: { "x-role": "admin" },
  });
  expect(res.status).toBe(200);
  const row = (await res.json()) as Record<string, unknown>;
  expect(row.id).toBe("p1");
  expect(row.authorId).toBe("a1"); // FK field preserved
  expect(row._expanded).toBeDefined();
  expect((row._expanded as Record<string, unknown>).authorId).toMatchObject({
    id: "a1",
    name: "Alice",
  });
});

test("relations: expand=authorId on list — each row has _expanded; null FK → null", async () => {
  const authorsTable = sqliteTable("authors", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
  });
  const postsWithAuthor = sqliteTable("posts_with_author", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    authorId: text("author_id"),
  });
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(sql`CREATE TABLE authors (id text PRIMARY KEY, name text NOT NULL)`);
  await ctx.db.run(
    sql`CREATE TABLE posts_with_author (id text PRIMARY KEY, title text NOT NULL, author_id text)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );
  await ctx.db.run(sql`INSERT INTO authors VALUES ('a1', 'Alice')`);
  await ctx.db.run(sql`INSERT INTO posts_with_author VALUES ('p1', 'Hello', 'a1')`);
  await ctx.db.run(sql`INSERT INTO posts_with_author VALUES ('p2', 'Orphan', NULL)`);

  const colAuthors = collection(authorsTable, { name: "authors" });
  const colPosts = collection(postsWithAuthor, {
    name: "posts_with_author",
    relations: { authorId: { collection: "authors" } },
  });
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [colPosts, colAuthors],
    },
    { db: ctx, authProvider: stubAuth },
  );

  const res = await app.request("/api/posts_with_author?expand=authorId", {
    headers: { "x-role": "admin" },
  });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as Record<string, unknown>[];
  expect(rows).toHaveLength(2);
  const p1 = rows.find((r) => r.id === "p1");
  const p2 = rows.find((r) => r.id === "p2");
  expect(p1).toBeDefined();
  expect(p1!._expanded).toBeDefined();
  expect((p1!._expanded as Record<string, unknown>).authorId).toMatchObject({
    id: "a1",
    name: "Alice",
  });
  expect(p2).toBeDefined();
  expect(p2!._expanded).toBeDefined();
  expect((p2!._expanded as Record<string, unknown>).authorId).toBeNull();
});

test("relations: expand=nope (undeclared relation) returns 400", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );
  const res = await app.request("/api/posts?expand=nope", { headers: { "x-role": "admin" } });
  expect(res.status).toBe(400);
});

test("relations: no ?expand → no _expanded key (backward compat)", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );
  await ctx.db.run(sql`INSERT INTO posts VALUES ('p1','hello',1)`);
  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: ctx, authProvider: stubAuth },
  );

  const list = await app.request("/api/posts", { headers: { "x-role": "admin" } });
  expect(list.status).toBe(200);
  const rows = (await list.json()) as Record<string, unknown>[];
  expect(rows[0]._expanded).toBeUndefined();

  const single = await app.request("/api/posts/p1", { headers: { "x-role": "admin" } });
  expect(single.status).toBe(200);
  const row = (await single.json()) as Record<string, unknown>;
  expect(row._expanded).toBeUndefined();
});

// ── Security: draft leak via ?expand ─────────────────────────────────────────

test("security: public caller expanding a draft target row gets null; admin gets the full row", async () => {
  const authorsTable = sqliteTable("authors_drafts", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull(),
  });
  const postsTable = sqliteTable("posts_rel_draft", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    authorId: text("author_id"),
  });

  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE authors_drafts (id text PRIMARY KEY, name text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE posts_rel_draft (id text PRIMARY KEY, title text NOT NULL, author_id text)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  // Insert a DRAFT author and a published post that references it.
  await ctx.db.run(sql`INSERT INTO authors_drafts VALUES ('au1', 'Draft Author', 'draft')`);
  await ctx.db.run(sql`INSERT INTO posts_rel_draft VALUES ('p1', 'Hello', 'au1')`);

  const colAuthors = collection(authorsTable, {
    name: "authors_drafts",
    drafts: { column: "status" },
    public: ["read"] as const,
  });
  const colPosts = collection(postsTable, {
    name: "posts_rel_draft",
    public: ["read"] as const,
    relations: { authorId: { collection: "authors_drafts" } },
  });

  const app = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [colPosts, colAuthors],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // Public caller (no x-role) expands authorId — target is a draft → must get null.
  const pubSingle = await app.request("/api/posts_rel_draft/p1?expand=authorId");
  expect(pubSingle.status).toBe(200);
  const pubSingleRow = (await pubSingle.json()) as Record<string, unknown>;
  expect((pubSingleRow._expanded as Record<string, unknown>).authorId).toBeNull();

  // Public caller on the list endpoint — same guarantee.
  const pubList = await app.request("/api/posts_rel_draft?expand=authorId");
  expect(pubList.status).toBe(200);
  const pubListRows = (await pubList.json()) as Record<string, unknown>[];
  const p1Pub = pubListRows.find((r) => r.id === "p1");
  expect(p1Pub).toBeDefined();
  expect((p1Pub!._expanded as Record<string, unknown>).authorId).toBeNull();

  // Admin caller (x-role: admin) expands the same — gets the full draft row.
  const admSingle = await app.request("/api/posts_rel_draft/p1?expand=authorId", {
    headers: { "x-role": "admin" },
  });
  expect(admSingle.status).toBe(200);
  const admSingleRow = (await admSingle.json()) as Record<string, unknown>;
  expect((admSingleRow._expanded as Record<string, unknown>).authorId).toMatchObject({
    id: "au1",
    name: "Draft Author",
    status: "draft",
  });

  // Admin on list.
  const admList = await app.request("/api/posts_rel_draft?expand=authorId", {
    headers: { "x-role": "admin" },
  });
  expect(admList.status).toBe(200);
  const admListRows = (await admList.json()) as Record<string, unknown>[];
  const p1Adm = admListRows.find((r) => r.id === "p1");
  expect(p1Adm).toBeDefined();
  expect((p1Adm!._expanded as Record<string, unknown>).authorId).toMatchObject({
    id: "au1",
    name: "Draft Author",
    status: "draft",
  });
});

// ── Webhooks (ADR-0047) ───────────────────────────────────────────────────────

async function buildWebhookApp(webhookCtx: EnbiDb, deliveries: WebhookDelivery[]) {
  return createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
      webhooks: [{ url: "https://hook.test/a", secret: "s3cret" }],
    },
    {
      db: webhookCtx,
      authProvider: stubAuth,
      webhookSink: (d) => deliveries.push(d),
    },
  );
}

test("webhooks: POST fires a create delivery with correct shape", async () => {
  const webhookCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await webhookCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  const deliveries: WebhookDelivery[] = [];
  const webhookApp = await buildWebhookApp(webhookCtx, deliveries);

  const res = await webhookApp.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "w1", title: "Webhook test", views: 0 }),
  });
  expect(res.status).toBe(201);
  expect(deliveries).toHaveLength(1);

  const [d] = deliveries;
  expect(d.url).toBe("https://hook.test/a");
  expect(d.payload.event).toBe("create");
  expect(d.payload.collection).toBe("posts");
  expect(d.payload.id).toBe("w1");
  expect((d.payload.data as Record<string, unknown>).id).toBe("w1");
  expect((d.payload.data as Record<string, unknown>).title).toBe("Webhook test");
  expect(d.signature).toBeDefined();
  expect(d.signature!.startsWith("sha256=")).toBe(true);
});

test("webhooks: PUT fires an update delivery", async () => {
  const webhookCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await webhookCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );
  await webhookCtx.db.run(sql`INSERT INTO posts VALUES ('w2','Original',0)`);

  const deliveries: WebhookDelivery[] = [];
  const webhookApp = await buildWebhookApp(webhookCtx, deliveries);

  const res = await webhookApp.request("/api/posts/w2", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Updated", views: 5 }),
  });
  expect(res.status).toBe(200);
  expect(deliveries).toHaveLength(1);

  const [d] = deliveries;
  expect(d.payload.event).toBe("update");
  expect(d.payload.collection).toBe("posts");
  expect(d.payload.id).toBe("w2");
});

test("webhooks: DELETE fires a delete delivery with data:{id}", async () => {
  const webhookCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await webhookCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );
  await webhookCtx.db.run(sql`INSERT INTO posts VALUES ('w3','To delete',0)`);

  const deliveries: WebhookDelivery[] = [];
  const webhookApp = await buildWebhookApp(webhookCtx, deliveries);

  const res = await webhookApp.request("/api/posts/w3", {
    method: "DELETE",
    headers: { "x-role": "admin" },
  });
  expect(res.status).toBe(204);
  expect(deliveries).toHaveLength(1);

  const [d] = deliveries;
  expect(d.payload.event).toBe("delete");
  expect(d.payload.collection).toBe("posts");
  expect(d.payload.id).toBe("w3");
  expect(d.payload.data).toEqual({ id: "w3" });
});

test("webhooks: event filtering — webhook with events:['delete'] does NOT fire on create", async () => {
  const webhookCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await webhookCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  const deliveries: WebhookDelivery[] = [];
  const filteredApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
      webhooks: [{ url: "https://hook.test/delete-only", events: ["delete"] }],
    },
    {
      db: webhookCtx,
      authProvider: stubAuth,
      webhookSink: (d) => deliveries.push(d),
    },
  );

  const res = await filteredApp.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "wf1", title: "Filter test", views: 0 }),
  });
  expect(res.status).toBe(201);
  expect(deliveries).toHaveLength(0);

  // Positive case: a DELETE should fire exactly one delivery with event === "delete".
  const del = await filteredApp.request("/api/posts/wf1", {
    method: "DELETE",
    headers: { "x-role": "admin" },
  });
  expect(del.status).toBe(204);
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0].payload.event).toBe("delete");
});

test("webhooks: collection filtering — webhook with collections:['other'] does NOT fire for posts", async () => {
  const webhookCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await webhookCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  const deliveries: WebhookDelivery[] = [];
  const filteredApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
      webhooks: [{ url: "https://hook.test/other-only", collections: ["other"] }],
    },
    {
      db: webhookCtx,
      authProvider: stubAuth,
      webhookSink: (d) => deliveries.push(d),
    },
  );

  const res = await filteredApp.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "wc1", title: "Collection filter", views: 0 }),
  });
  expect(res.status).toBe(201);
  expect(deliveries).toHaveLength(0);
});

test("webhooks: no secret → delivery has no signature", async () => {
  const webhookCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await webhookCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  const deliveries: WebhookDelivery[] = [];
  const noSecretApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
      webhooks: [{ url: "https://hook.test/no-secret" }],
    },
    {
      db: webhookCtx,
      authProvider: stubAuth,
      webhookSink: (d) => deliveries.push(d),
    },
  );

  const res = await noSecretApp.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "wns1", title: "No secret", views: 0 }),
  });
  expect(res.status).toBe(201);
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0].signature).toBeUndefined();
});

test("webhooks: signature equals independently-computed HMAC-SHA256 of JSON.stringify(payload)", async () => {
  const webhookCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await webhookCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await webhookCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  const secret = "verify-secret";
  const deliveries: WebhookDelivery[] = [];
  const verifyApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
      webhooks: [{ url: "https://hook.test/verify", secret }],
    },
    {
      db: webhookCtx,
      authProvider: stubAuth,
      webhookSink: (d) => deliveries.push(d),
    },
  );

  const res = await verifyApp.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "wv1", title: "Verify sig", views: 0 }),
  });
  expect(res.status).toBe(201);
  expect(deliveries).toHaveLength(1);

  const [d] = deliveries;
  expect(d.signature).toBeDefined();

  // Independently compute the expected HMAC-SHA256.
  const expectedHex = createHmac("sha256", secret).update(JSON.stringify(d.payload)).digest("hex");
  expect(d.signature).toBe(`sha256=${expectedHex}`);
});

// ── Field Validation (ADR-0049) ───────────────────────────────────────────────

// Table for validation tests: id, title (text), views (integer), email (text).
const validatedPosts = sqliteTable("validated_posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  views: integer("views").notNull(),
  email: text("email").notNull(),
});

async function buildValidationApp() {
  const vCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await vCtx.db.run(
    sql`CREATE TABLE validated_posts (
      id text PRIMARY KEY,
      title text NOT NULL,
      views integer NOT NULL,
      email text NOT NULL
    )`,
  );
  await vCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await vCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const col = collection(validatedPosts, {
    name: "validated_posts",
    validate: {
      title: { required: true, max: 5 },
      views: { type: "number", min: 0 },
      email: { type: "email" },
    },
  });
  const vApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [col],
    },
    { db: vCtx, authProvider: stubAuth },
  );
  return vApp;
}

test("validation: POST missing required title → 422 with title error", async () => {
  const vApp = await buildValidationApp();
  const res = await vApp.request("/api/validated_posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "p1", views: 1, email: "a@b.com" }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((e) => e.field === "title")).toBe(true);
});

test("validation: POST title too long (>5 chars) → 422", async () => {
  const vApp = await buildValidationApp();
  const res = await vApp.request("/api/validated_posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "p2", title: "toolong", views: 1, email: "a@b.com" }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((e) => e.field === "title")).toBe(true);
});

test("validation: POST views negative → 422", async () => {
  const vApp = await buildValidationApp();
  const res = await vApp.request("/api/validated_posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "p3", title: "hi", views: -1, email: "a@b.com" }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((e) => e.field === "views")).toBe(true);
});

test("validation: POST views non-numeric string → 422", async () => {
  const vApp = await buildValidationApp();
  const res = await vApp.request("/api/validated_posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "p4", title: "hi", views: "abc", email: "a@b.com" }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((e) => e.field === "views")).toBe(true);
});

test("validation: POST invalid email → 422", async () => {
  const vApp = await buildValidationApp();
  const res = await vApp.request("/api/validated_posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "p5", title: "hi", views: 0, email: "not-an-email" }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((e) => e.field === "email")).toBe(true);
});

test("validation: POST valid body → 201", async () => {
  const vApp = await buildValidationApp();
  const res = await vApp.request("/api/validated_posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "p6", title: "hello", views: 10, email: "user@example.com" }),
  });
  expect(res.status).toBe(201);
});

test("validation: collection with NO validate rules is unaffected", async () => {
  // The shared `posts` collection (no validate) must still allow any valid row.
  const res = await app.request("/api/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "editor" },
    body: JSON.stringify({ id: "novalidate", title: "anything", views: 0 }),
  });
  expect(res.status).toBe(201);
});

test("validation: validateFields unit — returns ALL errors for a multi-rule body", async () => {
  const errors = validateFields(
    {
      title: { required: true, max: 5 },
      views: { type: "number", min: 0 },
      email: { type: "email" },
    },
    { views: -99, email: "not-valid" }, // title missing, views negative, email bad
  );
  // All three fields should have errors
  const fields = errors.map((e) => e.field);
  expect(fields).toContain("title");
  expect(fields).toContain("views");
  expect(fields).toContain("email");
  expect(errors.length).toBeGreaterThanOrEqual(3);
});

// ── PUT + pattern/url/enum/boolean validation (ADR-0049 coverage) ─────────────

// Second fixture table whose columns cover pattern, url, enum, and boolean rules.
const validatedItems = sqliteTable("validated_items", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  link: text("link").notNull(),
  kind: text("kind").notNull(),
  flag: text("flag").notNull(),
});

async function buildItemsApp() {
  const iCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await iCtx.db.run(
    sql`CREATE TABLE validated_items (
      id text PRIMARY KEY,
      slug text NOT NULL,
      link text NOT NULL,
      kind text NOT NULL,
      flag text NOT NULL
    )`,
  );
  await iCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await iCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const col = collection(validatedItems, {
    name: "validated_items",
    validate: {
      slug: { pattern: "^[a-z]+$" },
      link: { type: "url" },
      kind: { enum: ["a", "b"] },
      flag: { type: "boolean" },
    },
  });
  return createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [col],
    },
    { db: iCtx, authProvider: stubAuth },
  );
}

// Helper: create a valid item and return the app (DRY for PUT tests).
async function buildItemsAppWithEntry(id: string) {
  const iApp = await buildItemsApp();
  const create = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id, slug: "abc", link: "https://example.com", kind: "a", flag: true }),
  });
  expect(create.status).toBe(201);
  return iApp;
}

test("validation: 422 shape — top-level has error, message, details array of {field,message}", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "shape1",
      slug: "INVALID",
      link: "not-a-url",
      kind: "z",
      flag: "x",
    }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as {
    error: string;
    message: string;
    details: { field: string; message: string }[];
  };
  expect(typeof body.error).toBe("string");
  expect(typeof body.message).toBe("string");
  expect(Array.isArray(body.details)).toBe(true);
  expect(
    body.details.every((d) => typeof d.field === "string" && typeof d.message === "string"),
  ).toBe(true);
});

test("validation: PUT — violating rule → 422 with details naming the field", async () => {
  const iApp = await buildItemsAppWithEntry("put1");
  const res = await iApp.request("/api/validated_items/put1", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    // slug violates pattern (uppercase); all other fields are fine.
    body: JSON.stringify({ slug: "UPPER", link: "https://example.com", kind: "a", flag: true }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((d) => d.field === "slug")).toBe(true);
});

test("validation: PUT — valid body → 200", async () => {
  const iApp = await buildItemsAppWithEntry("put2");
  const res = await iApp.request("/api/validated_items/put2", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ slug: "good", link: "https://ok.io", kind: "b", flag: false }),
  });
  expect(res.status).toBe(200);
});

test("validation: pattern — non-matching value → 422", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "pat1",
      slug: "Has Spaces",
      link: "https://x.com",
      kind: "a",
      flag: true,
    }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((d) => d.field === "slug")).toBe(true);
});

test("validation: pattern — matching value → 201", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "pat2",
      slug: "lowercase",
      link: "https://x.com",
      kind: "a",
      flag: true,
    }),
  });
  expect(res.status).toBe(201);
});

test("validation: url — non-URL string → 422", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "url1", slug: "abc", link: "not-a-url", kind: "a", flag: true }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((d) => d.field === "link")).toBe(true);
});

test("validation: url — valid URL → 201", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "url2",
      slug: "abc",
      link: "https://enbi.dev/path?q=1",
      kind: "a",
      flag: true,
    }),
  });
  expect(res.status).toBe(201);
});

test("validation: enum — value not in list → 422", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "enum1",
      slug: "abc",
      link: "https://x.com",
      kind: "c",
      flag: true,
    }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((d) => d.field === "kind")).toBe(true);
});

test("validation: enum — allowed value → 201", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "enum2",
      slug: "abc",
      link: "https://x.com",
      kind: "b",
      flag: true,
    }),
  });
  expect(res.status).toBe(201);
});

test("validation: boolean — non-boolean → 422", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "bool1",
      slug: "abc",
      link: "https://x.com",
      kind: "a",
      flag: "yes",
    }),
  });
  expect(res.status).toBe(422);
  const body = (await res.json()) as { details: { field: string }[] };
  expect(body.details.some((d) => d.field === "flag")).toBe(true);
});

test("validation: boolean — true → 201", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "bool2",
      slug: "abc",
      link: "https://x.com",
      kind: "a",
      flag: true,
    }),
  });
  expect(res.status).toBe(201);
});

test("validation: boolean — false → 201", async () => {
  const iApp = await buildItemsApp();
  const res = await iApp.request("/api/validated_items", {
    method: "POST",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({
      id: "bool3",
      slug: "abc",
      link: "https://x.com",
      kind: "a",
      flag: false,
    }),
  });
  expect(res.status).toBe(201);
});

test("fix: boolean value with min/max rule is not treated as numeric", () => {
  // Boolean true coerces to 1 via Number(), so without the guard it would pass
  // a min:0 check silently. The fix ensures booleans are excluded from the
  // numeric path and neither a type-error nor a spurious min/max error is raised.
  const errors = validateFields(
    { active: { min: 0, max: 10 } }, // no explicit type — relies on the coercion guard
    { active: true },
  );
  // The boolean should not be treated as a number → no min/max errors produced.
  expect(errors).toHaveLength(0);
});

test("collection(): localized defaults to []", () => {
  const t = sqliteTable("tmp_loc", { id: text("id").primaryKey() });
  const col = collection(t, { name: "tmp_loc" });
  expect(col.localized).toEqual([]);
});

test("collection(): localized is set when provided", () => {
  const t = sqliteTable("tmp_loc2", { id: text("id").primaryKey(), title: text("title") });
  const col = collection(t, { name: "tmp_loc2", localized: ["title"] });
  expect(col.localized).toEqual(["title"]);
});

// ── i18n helpers ──────────────────────────────────────────────────────────

async function buildI18nCtx() {
  const c = await createDb({ dialect: "sqlite", url: ":memory:" });
  await c.db.run(sql`CREATE TABLE _translations (
    id text PRIMARY KEY,
    collection text NOT NULL,
    entry_id text NOT NULL,
    locale text NOT NULL,
    field text NOT NULL,
    value text
  )`);
  return c;
}

test("readTranslations: returns empty object when no rows exist", async () => {
  const c = await buildI18nCtx();
  const result = await readTranslations(c.db, c.translations, "posts", "p1", "fr");
  expect(result).toEqual({});
});

test("writeTranslations + readTranslations: round-trip", async () => {
  const c = await buildI18nCtx();
  await writeTranslations(c.db, c.translations, "posts", "p1", "fr", { title: "Bonjour" });
  const result = await readTranslations(c.db, c.translations, "posts", "p1", "fr");
  expect(result).toEqual({ title: "Bonjour" });
});

test("writeTranslations: upsert replaces existing value", async () => {
  const c = await buildI18nCtx();
  await writeTranslations(c.db, c.translations, "posts", "p1", "fr", { title: "Bonjour" });
  await writeTranslations(c.db, c.translations, "posts", "p1", "fr", { title: "Salut" });
  const result = await readTranslations(c.db, c.translations, "posts", "p1", "fr");
  expect(result.title).toBe("Salut");
});

test("overlayTranslations: overlays translated fields on rows", async () => {
  const c = await buildI18nCtx();
  await writeTranslations(c.db, c.translations, "posts", "p1", "fr", { title: "Bonjour" });
  const rows = [{ id: "p1", title: "Hello", body: "World" }];
  const overlaid = await overlayTranslations(c.db, c.translations, rows, "posts", "fr", [
    "title",
    "body",
  ]);
  expect(overlaid[0]).toMatchObject({ id: "p1", title: "Bonjour", body: "World" });
});

test("overlayTranslations: falls back to base value when no translation", async () => {
  const c = await buildI18nCtx();
  const rows = [{ id: "p1", title: "Hello", body: "World" }];
  const overlaid = await overlayTranslations(c.db, c.translations, rows, "posts", "de", [
    "title",
    "body",
  ]);
  expect(overlaid[0]).toMatchObject({ title: "Hello", body: "World" });
});

// ── i18n / translations routes ────────────────────────────────────────────
const localizedPosts = sqliteTable("localized_posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
});

async function buildI18nApp() {
  const i18nCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await i18nCtx.db.run(
    sql`CREATE TABLE localized_posts (id text PRIMARY KEY, title text NOT NULL, body text NOT NULL)`,
  );
  await i18nCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await i18nCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await i18nCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  await i18nCtx.db.run(sql`CREATE TABLE _translations (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    locale text NOT NULL, field text NOT NULL, value text)`);

  const config = defineEnbiConfig({
    db: { dialect: "sqlite", url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*", viewer: "read" },
    collections: [
      collection(localizedPosts, {
        name: "localized_posts",
        localized: ["title", "body"],
      }),
    ],
    i18n: { locales: ["en", "fr"], defaultLocale: "en" },
  });

  const authProvider = composeProviders(apiKeyProvider(i18nCtx.db, i18nCtx.apiKeys), stubAuth);
  const i18nApp = await createServer(config, { db: i18nCtx, authProvider });
  return { i18nApp, i18nCtx };
}

test("i18n: PUT translations/fr stores field translations; GET translations/fr returns them", async () => {
  const { i18nApp, i18nCtx } = await buildI18nApp();
  await i18nCtx.db.run(
    sql`INSERT INTO localized_posts (id, title, body) VALUES ('p1', 'Hello', 'World')`,
  );

  const put = await i18nApp.request("/api/localized_posts/p1/translations/fr", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Bonjour" }),
  });
  expect(put.status).toBe(200);

  const get = await i18nApp.request("/api/localized_posts/p1/translations/fr", {
    headers: { "x-role": "viewer" },
  });
  expect(get.status).toBe(200);
  const data = (await get.json()) as Record<string, string>;
  expect(data.title).toBe("Bonjour");
  expect(data.body).toBeUndefined();
});

test("i18n: GET /:id?locale=fr overlays title but falls back to base body", async () => {
  const { i18nApp, i18nCtx } = await buildI18nApp();
  await i18nCtx.db.run(
    sql`INSERT INTO localized_posts (id, title, body) VALUES ('p1', 'Hello', 'World')`,
  );
  await i18nApp.request("/api/localized_posts/p1/translations/fr", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Bonjour" }),
  });

  const res = await i18nApp.request("/api/localized_posts/p1?locale=fr", {
    headers: { "x-role": "viewer" },
  });
  expect(res.status).toBe(200);
  const row = (await res.json()) as Record<string, string>;
  expect(row.title).toBe("Bonjour"); // translated
  expect(row.body).toBe("World"); // fallback
});

test("i18n: GET /:id with no locale returns base values unchanged", async () => {
  const { i18nApp, i18nCtx } = await buildI18nApp();
  await i18nCtx.db.run(
    sql`INSERT INTO localized_posts (id, title, body) VALUES ('p1', 'Hello', 'World')`,
  );
  await i18nApp.request("/api/localized_posts/p1/translations/fr", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Bonjour" }),
  });

  const res = await i18nApp.request("/api/localized_posts/p1", {
    headers: { "x-role": "viewer" },
  });
  expect(res.status).toBe(200);
  const row = (await res.json()) as Record<string, string>;
  expect(row.title).toBe("Hello");
  expect(row.body).toBe("World");
});

test("i18n: GET list ?locale=fr overlays rows", async () => {
  const { i18nApp, i18nCtx } = await buildI18nApp();
  await i18nCtx.db.run(
    sql`INSERT INTO localized_posts (id, title, body) VALUES ('p1', 'Hello', 'World')`,
  );
  await i18nApp.request("/api/localized_posts/p1/translations/fr", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Bonjour" }),
  });

  const res = await i18nApp.request("/api/localized_posts?locale=fr", {
    headers: { "x-role": "viewer" },
  });
  expect(res.status).toBe(200);
  const rows = (await res.json()) as Record<string, string>[];
  expect(rows).toHaveLength(1);
  expect(rows[0].title).toBe("Bonjour");
  expect(rows[0].body).toBe("World");
});

test("i18n: ?locale=zz (unknown locale) → 400", async () => {
  const { i18nApp, i18nCtx } = await buildI18nApp();
  await i18nCtx.db.run(
    sql`INSERT INTO localized_posts (id, title, body) VALUES ('p1', 'Hello', 'World')`,
  );
  const listRes = await i18nApp.request("/api/localized_posts?locale=zz", {
    headers: { "x-role": "viewer" },
  });
  expect(listRes.status).toBe(400);

  const getRes = await i18nApp.request("/api/localized_posts/p1?locale=zz", {
    headers: { "x-role": "viewer" },
  });
  expect(getRes.status).toBe(400);
});

test("i18n: PUT translations for non-localized field → 422", async () => {
  const { i18nApp, i18nCtx } = await buildI18nApp();
  await i18nCtx.db.run(
    sql`INSERT INTO localized_posts (id, title, body) VALUES ('p1', 'Hello', 'World')`,
  );
  const res = await i18nApp.request("/api/localized_posts/p1/translations/fr", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ id: "p1" }),
  });
  expect(res.status).toBe(422);
});

test("i18n: PUT translations for unconfigured locale → 400", async () => {
  const { i18nApp, i18nCtx } = await buildI18nApp();
  await i18nCtx.db.run(
    sql`INSERT INTO localized_posts (id, title, body) VALUES ('p1', 'Hello', 'World')`,
  );
  const res = await i18nApp.request("/api/localized_posts/p1/translations/de", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Hallo" }),
  });
  expect(res.status).toBe(400);
});

// ── Security: draft-leak via translations read endpoint ───────────────────────

const draftLocalizedPosts = sqliteTable("draft_localized_posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull(),
});

async function buildDraftI18nApp() {
  const dlCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await dlCtx.db.run(
    sql`CREATE TABLE draft_localized_posts (id text PRIMARY KEY, title text NOT NULL, status text NOT NULL)`,
  );
  await dlCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await dlCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await dlCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  await dlCtx.db.run(sql`CREATE TABLE _translations (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    locale text NOT NULL, field text NOT NULL, value text)`);

  const config = defineEnbiConfig({
    db: { dialect: "sqlite", url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*" },
    collections: [
      collection(draftLocalizedPosts, {
        name: "draft_localized_posts",
        drafts: { column: "status" },
        localized: ["title"],
        public: ["read"] as const,
      }),
    ],
    i18n: { locales: ["en", "fr"], defaultLocale: "en" },
  });

  const authProvider = composeProviders(apiKeyProvider(dlCtx.db, dlCtx.apiKeys), stubAuth);
  const dlApp = await createServer(config, { db: dlCtx, authProvider });
  return { dlApp, dlCtx };
}

test("security: GET translations/:locale of a DRAFT entry returns 404 to public; admin gets 200 with data", async () => {
  const { dlApp, dlCtx } = await buildDraftI18nApp();

  // Insert a DRAFT entry.
  await dlCtx.db.run(
    sql`INSERT INTO draft_localized_posts (id, title, status) VALUES ('d1', 'Draft title', 'draft')`,
  );

  // Set a French translation as admin so there IS data to potentially leak.
  const put = await dlApp.request("/api/draft_localized_posts/d1/translations/fr", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Titre brouillon" }),
  });
  expect(put.status).toBe(200);

  // Public caller (no x-role) → must get 404, not the translations.
  const pubGet = await dlApp.request("/api/draft_localized_posts/d1/translations/fr");
  expect(pubGet.status).toBe(404);

  // Admin caller (x-role: admin) → 200 with the stored translation.
  const admGet = await dlApp.request("/api/draft_localized_posts/d1/translations/fr", {
    headers: { "x-role": "admin" },
  });
  expect(admGet.status).toBe(200);
  const data = (await admGet.json()) as Record<string, string>;
  expect(data.title).toBe("Titre brouillon");
});

// ── Scheduled publishing (ADR-0052) ─────────────────────────────────────────

const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  publish_at: text("publish_at"),
});

async function buildScheduledApp() {
  const sCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await sCtx.db.run(sql`CREATE TABLE events (
    id text PRIMARY KEY,
    title text NOT NULL,
    publish_at text
  )`);
  await sCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await sCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  const sApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(events, { name: "events", scheduled: true, public: ["read"] as const }),
      ],
    },
    { db: sCtx, authProvider: stubAuth },
  );
  return { sApp, sCtx };
}

const PAST = "2020-01-01T00:00:00.000Z";
const FUTURE = "2099-12-31T23:59:59.000Z";

test("scheduled: public list hides future publish_at, shows null and past", async () => {
  const { sApp, sCtx } = await buildScheduledApp();
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e1','Past event',${PAST})`);
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e2','Future event',${FUTURE})`);
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e3','No schedule',NULL)`);

  const pub = await sApp.request("/api/events");
  expect(pub.status).toBe(200);
  const pubRows = (await pub.json()) as { id: string }[];
  const pubIds = pubRows.map((r) => r.id).sort();
  // Public sees past and null, not future
  expect(pubIds).toContain("e1");
  expect(pubIds).toContain("e3");
  expect(pubIds).not.toContain("e2");
});

test("scheduled: X-Total-Count (public) reflects only visible rows", async () => {
  const { sApp, sCtx } = await buildScheduledApp();
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e1','Past',${PAST})`);
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e2','Future',${FUTURE})`);
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e3','Null schedule',NULL)`);

  const pub = await sApp.request("/api/events");
  expect(pub.status).toBe(200);
  // 2 visible: e1 (past) + e3 (null)
  expect(pub.headers.get("X-Total-Count")).toBe("2");
});

test("scheduled: public GET of a future row → 404; admin GET → 200", async () => {
  const { sApp, sCtx } = await buildScheduledApp();
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e-future','Future',${FUTURE})`);

  const pub = await sApp.request("/api/events/e-future");
  expect(pub.status).toBe(404);

  const adm = await sApp.request("/api/events/e-future", { headers: { "x-role": "admin" } });
  expect(adm.status).toBe(200);
  expect(((await adm.json()) as { title: string }).title).toBe("Future");
});

test("scheduled: public GET of a past or null row → 200", async () => {
  const { sApp, sCtx } = await buildScheduledApp();
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e-past','Past',${PAST})`);
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e-null','No schedule',NULL)`);

  const pastRes = await sApp.request("/api/events/e-past");
  expect(pastRes.status).toBe(200);

  const nullRes = await sApp.request("/api/events/e-null");
  expect(nullRes.status).toBe(200);
});

test("scheduled: admin list sees all rows regardless of publish_at", async () => {
  const { sApp, sCtx } = await buildScheduledApp();
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e1','Past',${PAST})`);
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e2','Future',${FUTURE})`);
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e3','Null',NULL)`);

  const adm = await sApp.request("/api/events", { headers: { "x-role": "admin" } });
  expect(adm.status).toBe(200);
  const rows = (await adm.json()) as { id: string }[];
  expect(rows.map((r) => r.id).sort()).toEqual(["e1", "e2", "e3"]);
  expect(adm.headers.get("X-Total-Count")).toBe("3");
});

test("scheduled + drafts: public sees a row only when published AND publish_at <= now", async () => {
  // Table with both status + publish_at
  const combined = sqliteTable("combined_events", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    publish_at: text("publish_at"),
  });
  const cCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await cCtx.db.run(sql`CREATE TABLE combined_events (
    id text PRIMARY KEY,
    title text NOT NULL,
    status text NOT NULL,
    publish_at text
  )`);
  await cCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await cCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);

  // published + future publish_at → hidden (schedule not reached)
  await cCtx.db.run(
    sql`INSERT INTO combined_events VALUES ('c1','Pub+Future','published',${FUTURE})`,
  );
  // published + past publish_at → visible
  await cCtx.db.run(sql`INSERT INTO combined_events VALUES ('c2','Pub+Past','published',${PAST})`);
  // draft + past publish_at → hidden (still a draft)
  await cCtx.db.run(sql`INSERT INTO combined_events VALUES ('c3','Draft+Past','draft',${PAST})`);
  // published + null publish_at → visible
  await cCtx.db.run(sql`INSERT INTO combined_events VALUES ('c4','Pub+Null','published',NULL)`);

  const cApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [
        collection(combined, {
          name: "combined_events",
          drafts: true,
          scheduled: true,
          public: ["read"] as const,
        }),
      ],
    },
    { db: cCtx, authProvider: stubAuth },
  );

  const pub = await cApp.request("/api/combined_events");
  expect(pub.status).toBe(200);
  const pubIds = ((await pub.json()) as { id: string }[]).map((r) => r.id).sort();
  // c2 (published+past) and c4 (published+null) visible
  expect(pubIds).toEqual(["c2", "c4"]);
  // c1 (published+future) and c3 (draft+past) hidden
  expect(pubIds).not.toContain("c1");
  expect(pubIds).not.toContain("c3");
});

test("scheduled: non-scheduled collection is unaffected — no publish_at filtering", async () => {
  // Posts collection has no scheduled option → all rows visible without filter
  const nsCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await nsCtx.db.run(
    sql`CREATE TABLE posts (id text primary key, title text not null, views integer not null)`,
  );
  await nsCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await nsCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await nsCtx.db.run(sql`INSERT INTO posts VALUES ('p1','hello',1)`);

  const nsApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [collection(posts, { name: "posts" })],
    },
    { db: nsCtx, authProvider: stubAuth },
  );

  const adm = await nsApp.request("/api/posts", { headers: { "x-role": "admin" } });
  expect(adm.status).toBe(200);
  const rows = (await adm.json()) as { id: string }[];
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe("p1");
});

// ── Security: scheduled leak via sub-resource paths (review fixes) ───────────

test("security: public GET revisions of a future-scheduled entry → 404; admin → 200", async () => {
  const { sApp, sCtx } = await buildScheduledApp();
  // Insert a future-scheduled event with at least one revision so the admin path returns data.
  await sCtx.db.run(sql`INSERT INTO events VALUES ('e-future-rev','Future Rev',${FUTURE})`);
  await sCtx.db.run(
    sql`INSERT INTO _revisions (id, collection, entry_id, version, snapshot, author_id, created_at)
        VALUES ('r1','events','e-future-rev',1,'{}',NULL,'2099-01-01T00:00:00.000Z')`,
  );

  // Public caller (no x-role) must get 404, not the revision list.
  const pub = await sApp.request("/api/events/e-future-rev/revisions");
  expect(pub.status).toBe(404);

  // Admin caller gets 200 with the revision data.
  const adm = await sApp.request("/api/events/e-future-rev/revisions", {
    headers: { "x-role": "admin" },
  });
  expect(adm.status).toBe(200);
  const revs = (await adm.json()) as unknown[];
  expect(revs.length).toBeGreaterThanOrEqual(1);
});

// Table for scheduled + localized collection (translations leak test).
const scheduledLocalizedEvents = sqliteTable("sched_loc_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  publish_at: text("publish_at"),
});

async function buildScheduledI18nApp() {
  const slCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await slCtx.db.run(sql`CREATE TABLE sched_loc_events (
    id text PRIMARY KEY,
    title text NOT NULL,
    publish_at text
  )`);
  await slCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await slCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);
  await slCtx.db.run(sql`CREATE TABLE _media (
    id text PRIMARY KEY, filename text NOT NULL, mime text NOT NULL,
    size integer NOT NULL, created_at text NOT NULL)`);
  await slCtx.db.run(sql`CREATE TABLE _translations (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    locale text NOT NULL, field text NOT NULL, value text)`);

  const config = defineEnbiConfig({
    db: { dialect: "sqlite", url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*" },
    collections: [
      collection(scheduledLocalizedEvents, {
        name: "sched_loc_events",
        scheduled: true,
        localized: ["title"],
        public: ["read"] as const,
      }),
    ],
    i18n: { locales: ["en", "fr"], defaultLocale: "en" },
  });

  const authProvider = composeProviders(apiKeyProvider(slCtx.db, slCtx.apiKeys), stubAuth);
  const slApp = await createServer(config, { db: slCtx, authProvider });
  return { slApp, slCtx };
}

test("security: public GET translations of a future-scheduled entry → 404; admin → 200", async () => {
  const { slApp, slCtx } = await buildScheduledI18nApp();

  // Insert a future-scheduled entry.
  await slCtx.db.run(
    sql`INSERT INTO sched_loc_events (id, title, publish_at) VALUES ('sl-future','Future Title',${FUTURE})`,
  );

  // Store a French translation as admin so there IS data to potentially leak.
  const put = await slApp.request("/api/sched_loc_events/sl-future/translations/fr", {
    method: "PUT",
    headers: { "content-type": "application/json", "x-role": "admin" },
    body: JSON.stringify({ title: "Titre futur" }),
  });
  expect(put.status).toBe(200);

  // Public caller (no x-role) must get 404, not the translation.
  const pubGet = await slApp.request("/api/sched_loc_events/sl-future/translations/fr");
  expect(pubGet.status).toBe(404);

  // Admin caller gets 200 with the stored translation.
  const admGet = await slApp.request("/api/sched_loc_events/sl-future/translations/fr", {
    headers: { "x-role": "admin" },
  });
  expect(admGet.status).toBe(200);
  const data = (await admGet.json()) as Record<string, string>;
  expect(data.title).toBe("Titre futur");
});

// Table for scheduled expand leak test.
const schedTargets = sqliteTable("sched_targets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  publish_at: text("publish_at"),
});
const schedSources = sqliteTable("sched_sources", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  targetId: text("target_id"),
});

async function buildScheduledExpandApp() {
  const seCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await seCtx.db.run(sql`CREATE TABLE sched_targets (
    id text PRIMARY KEY, name text NOT NULL, publish_at text
  )`);
  await seCtx.db.run(sql`CREATE TABLE sched_sources (
    id text PRIMARY KEY, label text NOT NULL, target_id text
  )`);
  await seCtx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`);
  await seCtx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);

  const colTargets = collection(schedTargets, {
    name: "sched_targets",
    scheduled: true,
    public: ["read"] as const,
  });
  const colSources = collection(schedSources, {
    name: "sched_sources",
    public: ["read"] as const,
    relations: { targetId: { collection: "sched_targets" } },
  });

  const seApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [colSources, colTargets],
    },
    { db: seCtx, authProvider: stubAuth },
  );
  return { seApp, seCtx };
}

test("security: public expand of a future-scheduled target row gets null; admin gets the full row", async () => {
  const { seApp, seCtx } = await buildScheduledExpandApp();

  // Insert a future-scheduled target and a source that references it.
  await seCtx.db.run(sql`INSERT INTO sched_targets VALUES ('t-future','Future Target',${FUTURE})`);
  await seCtx.db.run(sql`INSERT INTO sched_sources VALUES ('s1','Source One','t-future')`);

  // Public caller (no x-role): expanding a future-scheduled target must yield null.
  const pubSingle = await seApp.request("/api/sched_sources/s1?expand=targetId");
  expect(pubSingle.status).toBe(200);
  const pubRow = (await pubSingle.json()) as Record<string, unknown>;
  expect((pubRow._expanded as Record<string, unknown>).targetId).toBeNull();

  // Public on the list endpoint — same guarantee.
  const pubList = await seApp.request("/api/sched_sources?expand=targetId");
  expect(pubList.status).toBe(200);
  const pubListRows = (await pubList.json()) as Record<string, unknown>[];
  const s1Pub = pubListRows.find((r) => r.id === "s1");
  expect(s1Pub).toBeDefined();
  expect((s1Pub!._expanded as Record<string, unknown>).targetId).toBeNull();

  // Admin caller: expanding the same future-scheduled target returns the full row.
  const admSingle = await seApp.request("/api/sched_sources/s1?expand=targetId", {
    headers: { "x-role": "admin" },
  });
  expect(admSingle.status).toBe(200);
  const admRow = (await admSingle.json()) as Record<string, unknown>;
  expect((admRow._expanded as Record<string, unknown>).targetId).toMatchObject({
    id: "t-future",
    name: "Future Target",
  });

  // Admin on list.
  const admList = await seApp.request("/api/sched_sources?expand=targetId", {
    headers: { "x-role": "admin" },
  });
  expect(admList.status).toBe(200);
  const admListRows = (await admList.json()) as Record<string, unknown>[];
  const s1Adm = admListRows.find((r) => r.id === "s1");
  expect(s1Adm).toBeDefined();
  expect((s1Adm!._expanded as Record<string, unknown>).targetId).toMatchObject({
    id: "t-future",
    name: "Future Target",
  });
});

test("batch expand: 3-row list — each row gets correct _expanded; draft target is null for public, full row for admin", async () => {
  const authorsTable = sqliteTable("batch_authors", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull(),
  });
  const postsTable = sqliteTable("batch_posts", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    authorId: text("author_id"),
  });

  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(
    sql`CREATE TABLE batch_authors (id text PRIMARY KEY, name text NOT NULL, status text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE batch_posts (id text PRIMARY KEY, title text NOT NULL, author_id text)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await ctx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  // Two published authors and one draft author
  await ctx.db.run(sql`INSERT INTO batch_authors VALUES ('au1','Alice','published')`);
  await ctx.db.run(sql`INSERT INTO batch_authors VALUES ('au2','Bob','published')`);
  await ctx.db.run(sql`INSERT INTO batch_authors VALUES ('au3','Charlie','draft')`);

  // Three posts: two pointing to published authors, one to the draft
  await ctx.db.run(sql`INSERT INTO batch_posts VALUES ('p1','Post 1','au1')`);
  await ctx.db.run(sql`INSERT INTO batch_posts VALUES ('p2','Post 2','au2')`);
  await ctx.db.run(sql`INSERT INTO batch_posts VALUES ('p3','Post 3','au3')`);

  const colAuthors = collection(authorsTable, {
    name: "batch_authors",
    drafts: { column: "status" },
    public: ["read"] as const,
  });
  const colPosts = collection(postsTable, {
    name: "batch_posts",
    public: ["read"] as const,
    relations: { authorId: { collection: "batch_authors" } },
  });

  const batchApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [colPosts, colAuthors],
    },
    { db: ctx, authProvider: stubAuth },
  );

  // Public caller: draft author must be null
  const pubRes = await batchApp.request("/api/batch_posts?expand=authorId");
  expect(pubRes.status).toBe(200);
  const pubRows = (await pubRes.json()) as Record<string, unknown>[];
  expect(pubRows).toHaveLength(3);
  const p1Pub = pubRows.find((r) => r.id === "p1");
  const p2Pub = pubRows.find((r) => r.id === "p2");
  const p3Pub = pubRows.find((r) => r.id === "p3");
  expect((p1Pub!._expanded as Record<string, unknown>).authorId).toMatchObject({
    id: "au1",
    name: "Alice",
  });
  expect((p2Pub!._expanded as Record<string, unknown>).authorId).toMatchObject({
    id: "au2",
    name: "Bob",
  });
  expect((p3Pub!._expanded as Record<string, unknown>).authorId).toBeNull(); // draft → null for public

  // Admin caller: draft author must be present
  const admRes = await batchApp.request("/api/batch_posts?expand=authorId", {
    headers: { "x-role": "admin" },
  });
  expect(admRes.status).toBe(200);
  const admRows = (await admRes.json()) as Record<string, unknown>[];
  const p3Adm = admRows.find((r) => r.id === "p3");
  expect((p3Adm!._expanded as Record<string, unknown>).authorId).toMatchObject({
    id: "au3",
    name: "Charlie",
    status: "draft",
  });
});

test("batch i18n: list with ?locale=fr overlays correct translation per row; missing translation falls back to default", async () => {
  const i18nPostsTable = sqliteTable("i18n_posts", {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
  });

  const i18nCtx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await i18nCtx.db.run(sql`CREATE TABLE i18n_posts (id text PRIMARY KEY, title text NOT NULL)`);
  await i18nCtx.db.run(sql`CREATE TABLE _translations (
    id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL,
    locale text NOT NULL, field text NOT NULL, value text)`);
  await i18nCtx.db.run(
    sql`CREATE TABLE _revisions (id text PRIMARY KEY, collection text NOT NULL, entry_id text NOT NULL, version integer NOT NULL, snapshot text NOT NULL, author_id text, created_at text NOT NULL)`,
  );
  await i18nCtx.db.run(
    sql`CREATE TABLE _api_keys (id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL, label text, created_at text NOT NULL, last_used_at text)`,
  );

  // Three posts in the default locale (en)
  await i18nCtx.db.run(sql`INSERT INTO i18n_posts VALUES ('ip1','Hello in English')`);
  await i18nCtx.db.run(sql`INSERT INTO i18n_posts VALUES ('ip2','World in English')`);
  await i18nCtx.db.run(sql`INSERT INTO i18n_posts VALUES ('ip3','No translation')`);

  // French translations for ip1 and ip2 only (ip3 has none — falls back to English)
  await i18nCtx.db.run(
    sql`INSERT INTO _translations VALUES ('t1','i18n_posts','ip1','fr','title','Bonjour en Français')`,
  );
  await i18nCtx.db.run(
    sql`INSERT INTO _translations VALUES ('t2','i18n_posts','ip2','fr','title','Monde en Français')`,
  );

  const colI18nPosts = collection(i18nPostsTable, {
    name: "i18n_posts",
    localized: ["title"] as const,
    public: ["read"] as const,
  });

  const i18nApp = await createServer(
    {
      db: { dialect: "sqlite", url: ":memory:" },
      auth: { secret: "x" },
      roles: { admin: "*" },
      collections: [colI18nPosts],
      i18n: { locales: ["en", "fr"], defaultLocale: "en" },
    },
    { db: i18nCtx, authProvider: stubAuth },
  );

  const res = await i18nApp.request("/api/i18n_posts?locale=fr");
  expect(res.status).toBe(200);
  const rows = (await res.json()) as { id: string; title: string }[];
  expect(rows).toHaveLength(3);
  const ip1 = rows.find((r) => r.id === "ip1");
  const ip2 = rows.find((r) => r.id === "ip2");
  const ip3 = rows.find((r) => r.id === "ip3");
  expect(ip1!.title).toBe("Bonjour en Français");
  expect(ip2!.title).toBe("Monde en Français");
  expect(ip3!.title).toBe("No translation"); // falls back to default locale value
});
