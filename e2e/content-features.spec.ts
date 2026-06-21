// e2e — content API feature coverage: pagination, sorting, filtering, unknown columns (ADR-0032).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const BIN = fileURLToPath(new URL("../tools/cli/dist/bin/enbi.mjs", import.meta.url));
const CONFIG = fileURLToPath(new URL("./enbi.config.ts", import.meta.url));

function mintKey(role: string): string {
  const res = spawnSync(
    "node",
    [BIN, "keys", "create", "--config", CONFIG, "--role", role, "--label", "e2e-features"],
    { encoding: "utf8" },
  );
  if (res.status !== 0 || res.error) {
    throw new Error(`key mint failed: ${res.stderr || res.error}`);
  }
  const lines = res.stderr.trim().split("\n");
  return lines[lines.length - 1].trim();
}

// ---------------------------------------------------------------------------
// (a) Pagination + sort: create 3 posts, GET ?limit=2&sort=-views → top 2 desc
// ---------------------------------------------------------------------------
test("query: limit + sort=-views returns top 2 in descending order with X-Total-Count", async ({
  request,
}) => {
  const key = mintKey("admin");
  const ts = Date.now();

  // Three posts with distinct view counts so sort order is deterministic.
  const posts = [
    { id: `feat-${ts}-a`, title: "Post A", views: 10 },
    { id: `feat-${ts}-b`, title: "Post B", views: 30 },
    { id: `feat-${ts}-c`, title: "Post C", views: 20 },
  ];
  for (const p of posts) {
    const res = await request.post("/api/posts", {
      headers: { "x-api-key": key },
      data: p,
    });
    expect(res.status(), `create ${p.id}: ${res.status()}`).toBe(201);
  }

  // At least the 3 we created are present; there may be more from other tests.
  const res = await request.get(`/api/posts?limit=2&sort=-views`, {
    headers: { "x-api-key": key },
  });
  expect(res.status()).toBe(200);

  const body = (await res.json()) as Array<{ id: string; views: number }>;
  expect(body.length).toBe(2);
  // The two returned must be in descending views order.
  expect(body[0]!.views).toBeGreaterThanOrEqual(body[1]!.views);

  const total = res.headers()["x-total-count"];
  expect(total).toBeDefined();
  expect(Number(total)).toBeGreaterThanOrEqual(3);
});

// ---------------------------------------------------------------------------
// (b) Filter: ?views__gte=N returns the right subset
// ---------------------------------------------------------------------------
test("filter: views__gte returns only posts meeting the threshold", async ({ request }) => {
  const key = mintKey("admin");
  const ts = Date.now() + 1; // distinct from (a)

  const posts = [
    { id: `feat-${ts}-x`, title: "Filter X", views: 5 },
    { id: `feat-${ts}-y`, title: "Filter Y", views: 50 },
    { id: `feat-${ts}-z`, title: "Filter Z", views: 100 },
  ];
  for (const p of posts) {
    await request.post("/api/posts", { headers: { "x-api-key": key }, data: p });
  }

  const res = await request.get(`/api/posts?views__gte=50&sort=views`, {
    headers: { "x-api-key": key },
  });
  expect(res.status()).toBe(200);

  const body = (await res.json()) as Array<{ id: string; views: number }>;
  // Every returned row must satisfy views >= 50.
  expect(body.length).toBeGreaterThanOrEqual(2);
  for (const row of body) {
    expect(row.views).toBeGreaterThanOrEqual(50);
  }
  // The low-view post must not appear.
  const ids = body.map((r) => r.id);
  expect(ids).not.toContain(`feat-${ts}-x`);
});

// ---------------------------------------------------------------------------
// (c) Validation: malformed create returns a non-2xx response
// ---------------------------------------------------------------------------
test("validation: create with missing required field is rejected", async ({ request }) => {
  const key = mintKey("admin");
  // `title` is NOT NULL in the posts schema — omitting it should fail.
  const res = await request.post("/api/posts", {
    headers: { "x-api-key": key },
    // Intentionally missing `title` and `id`.
    data: { views: 1 },
  });
  // The server must reject this — either 400 (validation) or 422.
  expect(res.status()).toBeGreaterThanOrEqual(400);
  expect(res.status()).toBeLessThan(500);
});

// ---------------------------------------------------------------------------
// (d) Unknown query column → 400
// ---------------------------------------------------------------------------
test("query: unknown column in filter param returns 400", async ({ request }) => {
  const key = mintKey("admin");
  const res = await request.get("/api/posts?nope=1", {
    headers: { "x-api-key": key },
  });
  expect(res.status()).toBe(400);
});
