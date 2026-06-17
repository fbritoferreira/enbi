import { expect, test } from "vite-plus/test";
import { getVersion } from "../src/index.ts";

test("getVersion returns the package version", () => {
  expect(getVersion()).toBe("0.1.0");
});
