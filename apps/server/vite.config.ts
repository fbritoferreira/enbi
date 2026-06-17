import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/main.ts"],
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
    alias: {
      "@enbi/db": fileURLToPath(new URL("../../packages/db/src/index.ts", import.meta.url)),
      "@enbi/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@enbi/auth": fileURLToPath(new URL("../../packages/auth/src/index.ts", import.meta.url)),
    },
  },
});
