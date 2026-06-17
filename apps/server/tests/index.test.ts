import { expect, test } from "vite-plus/test";
import { createServer } from "../src/index.ts";

test("GET /health returns ok", async () => {
  const app = createServer();
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
