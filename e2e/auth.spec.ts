import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const BIN = fileURLToPath(new URL("../tools/cli/dist/bin/enbi.mjs", import.meta.url));
const CONFIG = fileURLToPath(new URL("./enbi.config.ts", import.meta.url));

function mintKey(role: string): string {
  const res = spawnSync(
    "node",
    [BIN, "keys", "create", "--config", CONFIG, "--role", role, "--label", "e2e"],
    { encoding: "utf8" },
  );
  // The CLI prints status + the key (last line) to stderr (console.warn).
  const lines = res.stderr.trim().split("\n");
  return lines[lines.length - 1].trim();
}

function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}

test("health is up", async ({ request }) => {
  const res = await request.get("/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});

test("session: signup → signin → read content", async ({ request }) => {
  const email = unique("user");
  const signup = await request.post("/api/admin_auth/sign-up/email", {
    data: { email, password: "password12345", name: "E2E User" },
  });
  expect(signup.ok()).toBeTruthy();

  const signin = await request.post("/api/admin_auth/sign-in/email", {
    data: { email, password: "password12345" },
  });
  expect(signin.ok(), `signin ${signin.status()}: ${await signin.text()}`).toBeTruthy();

  // viewer (default role) may read.
  const list = await request.get("/api/posts");
  expect(list.status()).toBe(200);
});

test("api key authenticates and carries its role", async ({ request }) => {
  const key = mintKey("admin");
  expect(key.startsWith("enbi_")).toBeTruthy();

  const created = await request.post("/api/posts", {
    headers: { "x-api-key": key },
    data: { id: `p-${Date.now()}`, title: "via-key", views: 0 },
  });
  expect(created.status()).toBe(201);
});

test("denied: anonymous create is 401", async ({ request }) => {
  const res = await request.post("/api/posts", {
    data: { id: "nope", title: "x", views: 0 },
  });
  expect(res.status()).toBe(401);
});

test("denied: wrong password is rejected", async ({ request }) => {
  const email = unique("user");
  await request.post("/api/admin_auth/sign-up/email", {
    data: { email, password: "password12345", name: "E2E User" },
  });
  const bad = await request.post("/api/admin_auth/sign-in/email", {
    data: { email, password: "wrong-password" },
  });
  expect(bad.ok()).toBeFalsy();
});

test("denied: viewer cannot create (403)", async ({ request }) => {
  const email = unique("viewer");
  await request.post("/api/admin_auth/sign-up/email", {
    data: { email, password: "password12345", name: "Viewer" },
  });
  await request.post("/api/admin_auth/sign-in/email", {
    data: { email, password: "password12345" },
  });
  const create = await request.post("/api/posts", {
    data: { id: `v-${Date.now()}`, title: "x", views: 0 },
  });
  expect(create.status()).toBe(403);
});
