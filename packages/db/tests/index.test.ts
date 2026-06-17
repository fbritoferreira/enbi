import { sql } from "drizzle-orm";
import {
  getTableConfig,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { expect, test } from "vite-plus/test";
import { buildSchema, collection, createDb, defineEnbiConfig } from "../src/index.ts";

const posts = sqliteTable("posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  views: integer("views").notNull(),
});

// A collection table the user defines with their own indexes + unique constraint.
const articles = sqliteTable(
  "articles",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    views: integer("views").notNull(),
  },
  (t) => [uniqueIndex("articles_slug_unq").on(t.slug), index("articles_views_idx").on(t.views)],
);

test("collection() resolves the primary key and defaults", () => {
  const c = collection(posts, { name: "posts", title: "title" });
  expect(c.name).toBe("posts");
  expect(c.primaryKey).toBe("id");
  expect(c.versioned).toBe(true);
  expect(c.permissionsKey).toBe("posts");
});

test("defineEnbiConfig returns the config unchanged", () => {
  const config = defineEnbiConfig({
    db: { dialect: "sqlite", url: ":memory:" },
    auth: { secret: "x" },
    roles: { admin: "*" },
    collections: [collection(posts, { name: "posts" })],
  });
  expect(config.collections).toHaveLength(1);
  expect(config.roles.admin).toBe("*");
});

test("registering a collection preserves the user's indexes and constraints", () => {
  const c = collection(articles, { name: "articles", title: "title" });
  expect(c.primaryKey).toBe("id");

  // The registered table is the user's own Drizzle object — indexes survive.
  const config = getTableConfig(c.table);
  const names = config.indexes.map((i) => i.config.name);
  expect(names).toContain("articles_slug_unq");
  expect(names).toContain("articles_views_idx");

  // buildSchema hands that same table to drizzle-kit for migration generation.
  const schema = buildSchema("sqlite", [c]);
  expect(schema.articles).toBe(articles);
  expect(schema._revisions).toBeDefined();
});

test("createDb(sqlite) writes and reads the _revisions table", async () => {
  const { db, revisions } = await createDb({ dialect: "sqlite", url: ":memory:" });
  await db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY,
    collection text NOT NULL,
    entry_id text NOT NULL,
    version integer NOT NULL,
    snapshot text NOT NULL,
    author_id text,
    created_at text NOT NULL
  )`);

  await db.insert(revisions).values({
    id: "r1",
    collection: "posts",
    entryId: "p1",
    version: 1,
    snapshot: { title: "Hello", views: 0 },
    authorId: "u1",
    createdAt: "2026-06-17T00:00:00.000Z",
  });

  const rows = await db.select().from(revisions);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.version).toBe(1);
  expect(rows[0]?.snapshot).toEqual({ title: "Hello", views: 0 });
});
