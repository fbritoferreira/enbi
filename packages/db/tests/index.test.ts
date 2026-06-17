import { expect, test } from "vite-plus/test";
import { ENBI_DB_PLACEHOLDER, type EnbiDbConfig } from "../src/index.ts";

test("db placeholder export exists", () => {
  expect(ENBI_DB_PLACEHOLDER).toBe(true);
  const cfg: EnbiDbConfig = { dialect: "postgres" };
  expect(cfg.dialect).toBe("postgres");
});
