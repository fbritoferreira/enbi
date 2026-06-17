import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "bin/enbi.ts"],
    dts: {
      tsgo: true,
    },
    exports: false,
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
      "@enbi/db": src("../../packages/db/src/index.ts"),
      "@enbi/core": src("../../packages/core/src/index.ts"),
      "@enbi/auth": src("../../packages/auth/src/index.ts"),
      "@enbi/server": src("../../apps/server/src/index.ts"),
    },
  },
});
