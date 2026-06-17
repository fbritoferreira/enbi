import { expect, test } from "vite-plus/test";
import { ENBI_AUTH_PLACEHOLDER, type EnbiAuthConfig } from "../src/index.ts";

test("auth placeholder config type", () => {
  expect(ENBI_AUTH_PLACEHOLDER).toBe(true);
  const cfg: EnbiAuthConfig = { secret: "x" };
  expect(cfg.secret).toBe("x");
});
