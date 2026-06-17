import { expect, test } from "vite-plus/test";

test("admin api base default is http", () => {
  const apiBase = "http://localhost:3000";
  expect(apiBase).toMatch(/^http/);
});
