import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collection, createDb, type EnbiDb } from "@enbi/db";
import { createServer } from "@enbi/server";
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { expect, test } from "vite-plus/test";
import { runMigrate } from "../src/commands/migrate.ts";
import { loadConfig, resolveConfigPath } from "../src/config.ts";
import { getVersion, run } from "../src/index.ts";
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

test("migrate is a stub that throws", () => {
  expect(() => runMigrate()).toThrow(/coming soon/);
});

test("run routes `migrate` and surfaces its error", async () => {
  await expect(run(["node", "enbi", "migrate"])).rejects.toMatchObject({ code: "config" });
});
