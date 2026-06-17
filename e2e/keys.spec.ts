import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const BIN = fileURLToPath(new URL("../tools/cli/dist/bin/enbi.mjs", import.meta.url));
const CONFIG = fileURLToPath(new URL("./enbi.config.ts", import.meta.url));

function mintKey(role: string): string {
  const res = spawnSync(
    "node",
    [BIN, "keys", "create", "--config", CONFIG, "--role", role, "--label", "e2e-keys"],
    { encoding: "utf8" },
  );
  const lines = res.stderr.trim().split("\n");
  return lines[lines.length - 1].trim();
}

test("admin manages API keys over HTTP", async ({ request }) => {
  const admin = mintKey("admin");

  const created = await request.post("/api/admin_keys", {
    headers: { "x-api-key": admin },
    data: { role: "viewer", label: "http" },
  });
  expect(created.status()).toBe(201);
  const { id, key } = (await created.json()) as { id: string; key: string };
  expect(key.startsWith("enbi_")).toBeTruthy();

  const list = await request.get("/api/admin_keys", { headers: { "x-api-key": admin } });
  expect(list.status()).toBe(200);
  expect(((await list.json()) as unknown[]).length).toBeGreaterThan(0);

  const del = await request.delete(`/api/admin_keys/${id}`, { headers: { "x-api-key": admin } });
  expect(del.status()).toBe(204);
});

test("non-admin cannot manage keys", async ({ request }) => {
  const viewer = mintKey("viewer");
  expect(
    (await request.get("/api/admin_keys", { headers: { "x-api-key": viewer } })).status(),
  ).toBe(403);
  expect((await request.get("/api/admin_keys")).status()).toBe(401);
});
