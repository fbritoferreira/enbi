import { expect, test } from "vite-plus/test";
import { ENBI_CORE_PLACEHOLDER, type Revision } from "../src/index.ts";

test("core placeholder revision type", () => {
  expect(ENBI_CORE_PLACEHOLDER).toBe(true);
  const r: Revision = { id: "1", entryId: "e1", snapshot: {}, createdAt: "2026-06-17" };
  expect(r.entryId).toBe("e1");
});
