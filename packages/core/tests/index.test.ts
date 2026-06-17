import { createDb, type EnbiDb } from "@enbi/db";
import { sql } from "drizzle-orm";
import { beforeEach, expect, test } from "vite-plus/test";
import { getRevision, listRevisions, restoreRevision, writeRevision } from "../src/index.ts";

let ctx: EnbiDb;

beforeEach(async () => {
  ctx = await createDb({ dialect: "sqlite", url: ":memory:" });
  await ctx.db.run(sql`CREATE TABLE _revisions (
    id text PRIMARY KEY,
    collection text NOT NULL,
    entry_id text NOT NULL,
    version integer NOT NULL,
    snapshot text NOT NULL,
    author_id text,
    created_at text NOT NULL
  )`);
});

test("writeRevision increments version per entry", async () => {
  const r1 = await writeRevision(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
    data: { title: "v1" },
    authorId: "u1",
    now: "2026-06-17T00:00:00.000Z",
  });
  const r2 = await writeRevision(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
    data: { title: "v2" },
    now: "2026-06-17T00:01:00.000Z",
  });
  expect(r1.version).toBe(1);
  expect(r2.version).toBe(2);
  expect(r2.authorId).toBeNull();

  // A different entry starts its own version sequence.
  const other = await writeRevision(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p2",
    data: { title: "other" },
    now: "2026-06-17T00:02:00.000Z",
  });
  expect(other.version).toBe(1);
});

test("listRevisions returns newest first", async () => {
  await writeRevision(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
    data: { n: 1 },
    now: "t1",
  });
  await writeRevision(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
    data: { n: 2 },
    now: "t2",
  });
  const list = await listRevisions<{ n: number }>(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
  });
  expect(list.map((r) => r.version)).toEqual([2, 1]);
  expect(list[0]?.snapshot).toEqual({ n: 2 });
});

test("getRevision throws not_found for a missing version", async () => {
  await expect(
    getRevision(ctx.db, ctx.revisions, { collection: "posts", entryId: "p1", version: 99 }),
  ).rejects.toMatchObject({ code: "not_found", status: 404 });
});

test("restoreRevision returns the historical snapshot", async () => {
  await writeRevision(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
    data: { title: "old" },
    now: "t1",
  });
  await writeRevision(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
    data: { title: "new" },
    now: "t2",
  });
  const snapshot = await restoreRevision<{ title: string }>(ctx.db, ctx.revisions, {
    collection: "posts",
    entryId: "p1",
    version: 1,
  });
  expect(snapshot).toEqual({ title: "old" });
});
