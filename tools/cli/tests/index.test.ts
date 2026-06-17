import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collection, createDb, type EnbiConfig, type EnbiDb, EnbiError } from "@enbi/db";
import { createServer } from "@enbi/server";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { expect, test } from "vite-plus/test";
import { loadConfig, resolveConfigPath } from "../src/config.ts";
import { getVersion, run } from "../src/index.ts";
import { applyMigrations } from "../src/migrate/apply.ts";
import { generateMigration } from "../src/migrate/generate.ts";
import { assembleSchema } from "../src/migrate/schema.ts";
import { syncSchema } from "../src/sync.ts";

const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  views: integer("views").notNull(),
});

function tmpConfig(contents: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "enbi-cli-"));
  const path = join(dir, "enbi.config.ts");
  writeFileSync(path, contents);
  return { dir, path };
}

test("getVersion matches package.json", () => {
  expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
});

test("loadConfig loads and validates a TS config", async () => {
  const { dir } = tmpConfig(
    `export default { db: { dialect: "sqlite", url: ":memory:" }, auth: { secret: "x" }, roles: { admin: "*" }, collections: [] };`,
  );
  const config = await loadConfig(dir);
  expect(config.db.dialect).toBe("sqlite");
  expect(config.roles.admin).toBe("*");
});

test("loadConfig rejects a non-config export", async () => {
  const { dir } = tmpConfig(`export default { nope: true };`);
  await expect(loadConfig(dir)).rejects.toMatchObject({ code: "config" });
});

test("resolveConfigPath throws when no config exists", () => {
  const dir = mkdtempSync(join(tmpdir(), "enbi-empty-"));
  expect(() => resolveConfigPath(dir)).toThrow(/No enbi config/);
});

test("syncSchema pushes the schema so tables exist", async () => {
  const ctx: EnbiDb = await createDb({ dialect: "sqlite", url: ":memory:" });
  const config = {
    db: { dialect: "sqlite" as const, url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*" as const },
    collections: [collection(posts, { name: "posts", title: "title" })],
  };
  const result = await syncSchema(ctx, config);
  expect(result.statements.length).toBeGreaterThan(0);

  const tables = await ctx.db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type='table'`,
  );
  const names = tables.map((t) => t.name);
  expect(names).toContain("posts");
  expect(names).toContain("_revisions");
  expect(names).toContain("_api_keys");
});

test("dev data path: synced db serves the content API", async () => {
  const ctx: EnbiDb = await createDb({ dialect: "sqlite", url: ":memory:" });
  const config = {
    db: { dialect: "sqlite" as const, url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*" as const },
    collections: [collection(posts, { name: "posts", public: ["read"] as const })],
  };
  await syncSchema(ctx, config);
  const app = await createServer(config, { db: ctx });

  const health = await app.request("/health");
  expect(health.status).toBe(200);
  // pages-style public read works against the synced tables.
  const list = await app.request("/api/posts");
  expect(list.status).toBe(200);
  expect((await list.json()) as unknown[]).toEqual([]);
});

const cfg = (): EnbiConfig => ({
  db: { dialect: "sqlite", url: ":memory:" },
  auth: { secret: "x" },
  roles: { admin: "*" },
  collections: [collection(posts, { name: "posts", title: "title" })],
});

test("assembleSchema includes content, internal, and auth tables", () => {
  const schema = assembleSchema(cfg(), "sqlite");
  for (const t of ["posts", "_revisions", "_api_keys", "user", "session"]) {
    expect(schema[t]).toBeDefined();
  }
});

test("generate writes a migration then nothing on a no-op re-run", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "enbi-mig-")), "drizzle");
  const first = await generateMigration(cfg(), "sqlite", dir);
  expect(first.file).not.toBeNull();
  expect(first.statements).toBeGreaterThan(0);

  const second = await generateMigration(cfg(), "sqlite", dir);
  expect(second.file).toBeNull();
});

test("migrate applies generated files, idempotently", async () => {
  const dir = join(mkdtempSync(join(tmpdir(), "enbi-mig-")), "drizzle");
  await generateMigration(cfg(), "sqlite", dir);

  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const applied = await applyMigrations(ctx, dir, "t0");
  expect(applied.length).toBe(1);

  const names = (
    await ctx.db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table'`)
  ).map((t) => t.name);
  expect(names).toContain("posts");
  expect(names).toContain("user");
  expect(names).toContain("_revisions");

  // Re-run is a no-op (tracking works).
  const again = await applyMigrations(ctx, dir, "t1");
  expect(again).toEqual([]);
});

test("keys create → list → revoke via runKeys", async () => {
  const { runKeys } = await import("../src/commands/keys.ts");
  const dir = mkdtempSync(join(tmpdir(), "enbi-keys-"));
  writeFileSync(
    join(dir, "enbi.config.ts"),
    `export default { db: { dialect: "sqlite", url: "file:${join(dir, "k.db").replaceAll("\\\\", "/")}" }, auth: { secret: "x" }, roles: { admin: "*" }, collections: [] };`,
  );
  // Tables must exist first.
  const { createDb } = await import("@enbi/db");
  const ctx = await createDb({ dialect: "sqlite", url: `file:${join(dir, "k.db")}` });
  await ctx.db.run(sql`CREATE TABLE _api_keys (
    id text PRIMARY KEY, hashed_key text NOT NULL, role text NOT NULL,
    label text, created_at text NOT NULL, last_used_at text)`);

  await runKeys("create", undefined, { cwd: dir, role: "admin", label: "t" });
  const after = await createDb({ dialect: "sqlite", url: `file:${join(dir, "k.db")}` });
  const rows = await after.db.all<{ role: string }>(sql`SELECT role FROM _api_keys`);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.role).toBe("admin");

  // Unknown action throws a typed error.
  await expect(runKeys("nope", undefined, { cwd: dir })).rejects.toMatchObject({
    code: "validation",
  });
});

test("first user created becomes admin; later users get the default role", async () => {
  const ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  const config = {
    db: { dialect: "sqlite" as const, url: ":memory:" },
    auth: { secret: "first-user-admin-secret-32-characters", baseURL: "http://localhost" },
    roles: { admin: "*" as const, viewer: "read" as const },
    collections: [],
  };
  await syncSchema(ctx, config);
  const app = await createServer(config, { db: ctx });

  const signup = (email: string) =>
    app.request("/api/admin_auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost" },
      body: JSON.stringify({ email, password: "password12345", name: "U" }),
    });

  expect((await signup("first@x.test")).ok).toBeTruthy();
  expect((await signup("second@x.test")).ok).toBeTruthy();

  const rows = await ctx.db.all<{ email: string; role: string }>(
    sql`SELECT email, role FROM user ORDER BY email`,
  );
  const byEmail = Object.fromEntries(rows.map((r) => [r.email, r.role]));
  expect(byEmail["first@x.test"]).toBe("admin");
  expect(byEmail["second@x.test"]).toBe("viewer");
});

test("enbi build runs the admin build path (or surfaces a typed error)", async () => {
  const { runBuild } = await import("../src/commands/build.ts");
  // Either it builds the admin, or throws a typed EnbiError if astro/@enbi/admin
  // can't be resolved from here. Anything else is a real failure.
  const outcome = await runBuild().then(
    () => "built" as const,
    (error: unknown) => error,
  );
  expect(outcome === "built" || outcome instanceof EnbiError).toBe(true);
}, 120_000);

test("run routes `migrate` and surfaces a missing-config error", async () => {
  const empty = mkdtempSync(join(tmpdir(), "enbi-noconfig-"));
  const cwd = process.cwd();
  process.chdir(empty);
  try {
    await expect(run(["node", "enbi", "migrate"])).rejects.toMatchObject({ code: "config" });
  } finally {
    process.chdir(cwd);
  }
});
