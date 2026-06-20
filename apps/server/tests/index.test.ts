import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
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
import { afterEach, beforeEach, expect, test } from "vite-plus/test";
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
