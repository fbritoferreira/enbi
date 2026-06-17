import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
  test: {
    include: ["tests/**/*.test.ts"],
    // Resolve workspace deps to source so tests run against current code,
    // not a stale built dist.
    alias: {
      "@enbi/db": fileURLToPath(new URL("../db/src/index.ts", import.meta.url)),
    },
  },
});
