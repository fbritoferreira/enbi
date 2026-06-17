// Full-stack integration across all three dialects (ADR-0035). Postgres/MySQL run
// in testcontainers; SQLite uses a temp file. A dialect skips if its container
// can't start (no Docker), so the suite stays green without Docker.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { issueApiKey } from "@enbi/auth";
import { collection, createDb, type EnbiConfig, type EnbiDb, type EnbiDialect } from "@enbi/db";
import { createServer } from "@enbi/server";
import { mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { pgTable, text as pgText } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText } from "drizzle-orm/sqlite-core";
import type { Table } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { applyMigrations } from "../src/migrate/apply.ts";
import { generateMigration } from "../src/migrate/generate.ts";

const posts: Record<EnbiDialect, Table> = {
  sqlite: sqliteTable("posts", {
    id: sqliteText("id").primaryKey(),
    title: sqliteText("title").notNull(),
  }),
  postgres: pgTable("posts", { id: pgText("id").primaryKey(), title: pgText("title").notNull() }),
  mysql: mysqlTable("posts", {
    id: varchar("id", { length: 255 }).primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
  }),
};

type Provisioned = { url: string; stop: () => Promise<void> };

async function provision(dialect: EnbiDialect): Promise<Provisioned | null> {
  if (dialect === "sqlite") {
    const file = join(mkdtempSync(join(tmpdir(), "enbi-dialect-")), "db.sqlite");
    return { url: `file:${file}`, stop: () => Promise.resolve() };
  }
  try {
    if (dialect === "postgres") {
      const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
      const c = await new PostgreSqlContainer("postgres:16").withStartupTimeout(120_000).start();
      return {
        url: c.getConnectionUri(),
        stop: async () => {
          await c.stop();
        },
      };
    }
    const { MySqlContainer } = await import("@testcontainers/mysql");
    const c = await new MySqlContainer("mysql:8.0").withStartupTimeout(120_000).start();
    return {
      url: c.getConnectionUri(),
      stop: async () => {
        await c.stop();
      },
    };
  } catch (error) {
    console.warn(
      `enbi dialect test: skipping ${dialect} (container unavailable): ${String(error)}`,
    );
    return null;
  }
}

function makeConfig(dialect: EnbiDialect, url: string): EnbiConfig {
  return {
    db: { dialect, url },
    auth: { secret: "dialect-secret-at-least-32-characters!", baseURL: "http://localhost" },
    roles: { admin: "*", viewer: "read" },
    collections: [collection(posts[dialect], { name: "posts" })],
  };
}

function dialectSuite(dialect: EnbiDialect): void {
  describe(`dialect: ${dialect}`, () => {
    let ctx: EnbiDb | null = null;
    let app: Awaited<ReturnType<typeof createServer>> | null = null;
    let stop: () => Promise<void> = () => Promise.resolve();

    beforeAll(async () => {
      const p = await provision(dialect);
      if (!p) return; // skipped: no container
      stop = p.stop;
      const config = makeConfig(dialect, p.url);
      ctx = await createDb(config.db);
      const dir = mkdtempSync(join(tmpdir(), `enbi-mig-${dialect}-`));
      await generateMigration(config, dialect, dir);
      await applyMigrations(ctx, dir);
      app = await createServer(config, { db: ctx });
    }, 180_000);

    afterAll(async () => {
      // Close the DB connection before stopping the container, else Postgres/MySQL
      // raise a connection-terminated error (e.g. pg 57P01) on the open pool.
      const client = (ctx?.db as { $client?: { end?: () => Promise<void>; close?: () => void } })
        ?.$client;
      await client?.end?.();
      client?.close?.();
      await stop();
    });

    test("generate→migrate→server: content, versioning, auth bootstrap, keys", async () => {
      if (!app || !ctx) {
        console.warn(`enbi dialect test: ${dialect} not provisioned — skipped`);
        return;
      }

      // First signup becomes admin (bootstrap).
      const email = `admin-${dialect}@e2e.test`;
      const signup = await app.request("/api/admin_auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: JSON.stringify({ email, password: "password12345", name: "Admin" }),
      });
      expect(signup.ok).toBeTruthy();

      // An admin API key drives the content + keys APIs.
      const { key } = await issueApiKey(ctx.db, ctx.apiKeys, { role: "admin" });
      const auth = { "content-type": "application/json", "x-api-key": key };

      const created = await app.request("/api/posts", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ id: "p1", title: "hello" }),
      });
      expect(created.status).toBe(201);

      const updated = await app.request("/api/posts/p1", {
        method: "PUT",
        headers: auth,
        body: JSON.stringify({ title: "updated" }),
      });
      expect(updated.status).toBe(200);

      const revs = (await (
        await app.request("/api/posts/p1/revisions", { headers: { "x-api-key": key } })
      ).json()) as unknown[];
      expect(revs.length).toBe(2);

      const keys = await app.request("/api/admin_keys", { headers: { "x-api-key": key } });
      expect(keys.status).toBe(200);
    });
  });
}

dialectSuite("sqlite");
dialectSuite("postgres");
dialectSuite("mysql");
