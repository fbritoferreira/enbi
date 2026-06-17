import { expect, test } from "vite-plus/test";
import pkg from "../package.json" with { type: "json" };
import { getVersion } from "../src/index.ts";

test("getVersion returns the package version", () => {
  // Compare to package.json (not a hardcoded literal) so version bumps don't break it.
  expect(getVersion()).toBe(pkg.version);
  expect(getVersion()).toMatch(/^\d+\.\d+\.\d+/);
});
