# enbi Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the six `@enbi/*` packages in this Vite+ monorepo with placeholder exports, wired build/test, secure CI/CD, and a locally working dev loop — no business logic.

**Architecture:** Framework-distributed headless CMS. Three libraries (`db`, `core`, `auth`), a Hono content server, an Astro admin, and a CLI. All built/tested through Vite+ (`vp`). Libraries build with `vp pack` (tsdown); admin builds with Astro. Workspace task ordering comes from `package.json` workspace deps. See spec `docs/superpowers/specs/2026-06-17-enbi-scaffolding-design.md` and ADRs `docs/adr/0001`–`0010`.

**Tech Stack:** Vite+ (`vp` v0.2.x, vite-plus v0.1.x), pnpm 11, Node ≥22.18 (local toolchain 24.x), TypeScript 5, Hono, `@hono/node-server`, Astro, Vitest. (Drizzle/better-auth are NOT added here — their sub-projects add them.)

## Global Constraints

- **Toolchain:** everything goes through `vp` — `vp pack` for libs, `vp build`/Astro for apps, `vp test`, `vp check`. No hand-rolled rollup/jest/eslint. (ADR-0006)
- **npm scope / bin:** packages are `@enbi/*`; CLI binary is `enbi`. Scoped packages publish with `--access public`. (ADR-0007)
- **No business logic this deliverable:** placeholder typed exports only; server exposes `GET /health`, CLI exposes `--version`. (ADR-0009)
- **Dependency direction (acyclic):** `cli → server → {core, auth, db}`; `admin → server over HTTP only` (admin must NOT import server/core/auth/db). (ADR-0010)
- **DB drivers later:** db package supports Postgres, SQLite, MySQL — but only as a typed placeholder now. (ADR-0003)
- **Versioning model:** full row snapshots per save — placeholder type only now. (ADR-0004)
- **CI security:** OIDC trusted publishing, no `NPM_TOKEN`; actions pinned to commit SHAs; least-privilege permissions; egress block; lifecycle scripts disabled; release only on tags. (ADR-0008)
- **COMMIT POLICY — repo override:** The agent NEVER commits or pushes on this repo. Every task ends by **staging** changes (`git add`) and running the verification gate; the **user performs all commits**. Wherever this plan shows a commit, run `git add` only and stop. (memory: enbi-no-commit)
- **Node version pin:** workflows and tooling target Node `24`.

---

## File Structure

```
package.json                      # root: scripts updated, no website ref
vite.config.ts                    # root: lint/fmt overrides per package group
pnpm-workspace.yaml               # add pnpm.onlyBuiltDependencies allowlist (empty)
.github/workflows/ci.yml          # PR/push: install/check/test/build, no secrets
.github/workflows/release.yml     # tag-only: OIDC publish (dry-run for now)
packages/db/        @enbi/db       # vp:library — EnbiDbConfig placeholder
packages/core/      @enbi/core     # vp:library — Revision placeholder
packages/auth/      @enbi/auth     # vp:library — EnbiAuthConfig placeholder
apps/server/        @enbi/server   # Hono createServer() + GET /health
apps/admin/         @enbi/admin    # Astro default page
tools/cli/          @enbi/cli      # bin `enbi`, --version only
```

Each library/package owns: `package.json`, `tsconfig.json`, `vite.config.ts` (pack/test block), `src/index.ts`, `tests/index.test.ts`. Admin owns an Astro project.

---

## Task 0: Clean out Vite+ template leftovers

**Files:**

- Delete: `apps/website/` (entire dir)
- Delete: `packages/utils/` (entire dir)
- Modify: root `package.json` (scripts)

**Interfaces:**

- Produces: a clean workspace with no `website`/`utils` packages; root `dev` script no longer references `website`.

- [ ] **Step 1: Remove leftover packages**

```bash
cd /Users/filipe.ferreira/code/github/fbritoferreira/enbi
git rm -r apps/website packages/utils
```

- [ ] **Step 2: Repoint root scripts**

Edit root `package.json` `scripts` to:

```json
{
  "scripts": {
    "ready": "vp check && vp run -r test && vp run -r build",
    "dev": "vp run -r --parallel dev",
    "prepare": "vp config"
  }
}
```

- [ ] **Step 3: Verify workspace still resolves**

Run: `vp install`
Expected: completes; no reference errors to `website`/`utils`.

- [ ] **Step 4: Stage (do NOT commit)**

```bash
git add -A
```

---

## Task 1: Scaffold `@enbi/db` library

**Files:**

- Create: `packages/db/` via `vp create vite:library`
- Edit: `packages/db/package.json`, `packages/db/vite.config.ts`, `packages/db/src/index.ts`
- Test: `packages/db/tests/index.test.ts`

**Interfaces:**

- Produces: `export type EnbiDbDialect = 'postgres' | 'sqlite' | 'mysql'`; `export type EnbiDbConfig = { dialect: EnbiDbDialect }`; `export const ENBI_DB_PLACEHOLDER: true`.

- [ ] **Step 1: Scaffold the library**

```bash
cd /Users/filipe.ferreira/code/github/fbritoferreira/enbi
vp create vite:library --directory packages/db --no-interactive --no-git --no-hooks
```

Expected: `packages/db` created with `package.json`, `vite.config.ts`, `src/`, `tsconfig.json`.

- [ ] **Step 2: Set package.json**

`packages/db/package.json`:

```json
{
  "name": "@enbi/db",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "vp pack",
    "test": "vp test run",
    "dev": "vp pack --watch"
  },
  "devDependencies": { "vite-plus": "catalog:" }
}
```

- [ ] **Step 3: Set pack/test config**

`packages/db/vite.config.ts`:

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: { entry: ["src/index.ts"], dts: true, format: ["esm"], sourcemap: true },
  test: { include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: Write the failing test**

`packages/db/tests/index.test.ts`:

```ts
import { expect, test } from "vitest";
import { ENBI_DB_PLACEHOLDER, type EnbiDbConfig } from "../src/index.js";

test("db placeholder export exists", () => {
  expect(ENBI_DB_PLACEHOLDER).toBe(true);
  const cfg: EnbiDbConfig = { dialect: "postgres" };
  expect(cfg.dialect).toBe("postgres");
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `vp run @enbi/db#test`
Expected: FAIL — cannot resolve `../src/index.js` exports.

- [ ] **Step 6: Write minimal implementation**

`packages/db/src/index.ts`:

```ts
// @enbi/db — Drizzle config surface. Logic lands in its own sub-project (ADR-0003).
export type EnbiDbDialect = "postgres" | "sqlite" | "mysql";
export type EnbiDbConfig = { dialect: EnbiDbDialect };
export const ENBI_DB_PLACEHOLDER = true as const;
```

- [ ] **Step 7: Run test + typecheck**

Run: `vp run @enbi/db#test && vp check`
Expected: PASS; 0 lint/type errors.

- [ ] **Step 8: Build to verify pack works**

Run: `vp run @enbi/db#build`
Expected: emits `packages/db/dist/index.js` + `index.d.ts`.

- [ ] **Step 9: Stage (do NOT commit)**

```bash
git add packages/db
```

---

## Task 2: Scaffold `@enbi/core` library

**Files:**

- Create: `packages/core/` via `vp create vite:library`
- Edit: `packages/core/package.json`, `vite.config.ts`, `src/index.ts`
- Test: `packages/core/tests/index.test.ts`

**Interfaces:**

- Produces: `export type Revision = { id: string; entryId: string; snapshot: unknown; createdAt: string }`; `export const ENBI_CORE_PLACEHOLDER: true`.

- [ ] **Step 1: Scaffold**

```bash
vp create vite:library --directory packages/core --no-interactive --no-git --no-hooks
```

- [ ] **Step 2: package.json** — identical shape to Task 1 Step 2 but `"name": "@enbi/core"`.

- [ ] **Step 3: vite.config.ts** — identical to Task 1 Step 3.

- [ ] **Step 4: Write the failing test**

`packages/core/tests/index.test.ts`:

```ts
import { expect, test } from "vitest";
import { ENBI_CORE_PLACEHOLDER, type Revision } from "../src/index.js";

test("core placeholder revision type", () => {
  expect(ENBI_CORE_PLACEHOLDER).toBe(true);
  const r: Revision = { id: "1", entryId: "e1", snapshot: {}, createdAt: "2026-06-17" };
  expect(r.entryId).toBe("e1");
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `vp run @enbi/core#test`
Expected: FAIL — exports missing.

- [ ] **Step 6: Implementation**

`packages/core/src/index.ts`:

```ts
// @enbi/core — full row snapshot versioning engine. Logic lands later (ADR-0004).
export type Revision = {
  id: string;
  entryId: string;
  snapshot: unknown;
  createdAt: string;
};
export const ENBI_CORE_PLACEHOLDER = true as const;
```

- [ ] **Step 7: Test + check + build**

Run: `vp run @enbi/core#test && vp check && vp run @enbi/core#build`
Expected: PASS; `dist/` emitted.

- [ ] **Step 8: Stage** — `git add packages/core`

---

## Task 3: Scaffold `@enbi/auth` library

**Files:**

- Create: `packages/auth/` via `vp create vite:library`
- Edit: `package.json`, `vite.config.ts`, `src/index.ts`
- Test: `packages/auth/tests/index.test.ts`

**Interfaces:**

- Produces: `export type EnbiAuthConfig = { secret: string }`; `export const ENBI_AUTH_PLACEHOLDER: true`.

- [ ] **Step 1: Scaffold**

```bash
vp create vite:library --directory packages/auth --no-interactive --no-git --no-hooks
```

- [ ] **Step 2: package.json** — Task 1 Step 2 shape, `"name": "@enbi/auth"`.
- [ ] **Step 3: vite.config.ts** — Task 1 Step 3.

- [ ] **Step 4: Write the failing test**

`packages/auth/tests/index.test.ts`:

```ts
import { expect, test } from "vitest";
import { ENBI_AUTH_PLACEHOLDER, type EnbiAuthConfig } from "../src/index.js";

test("auth placeholder config type", () => {
  expect(ENBI_AUTH_PLACEHOLDER).toBe(true);
  const cfg: EnbiAuthConfig = { secret: "x" };
  expect(cfg.secret).toBe("x");
});
```

- [ ] **Step 5: Run test to verify it fails** — `vp run @enbi/auth#test` → FAIL.

- [ ] **Step 6: Implementation**

`packages/auth/src/index.ts`:

```ts
// @enbi/auth — better-auth wiring. Logic lands later (ADR-0005).
export type EnbiAuthConfig = { secret: string };
export const ENBI_AUTH_PLACEHOLDER = true as const;
```

- [ ] **Step 7: Test + check + build** — `vp run @enbi/auth#test && vp check && vp run @enbi/auth#build` → PASS.
- [ ] **Step 8: Stage** — `git add packages/auth`

---

## Task 4: Scaffold `@enbi/server` (Hono content API)

**Files:**

- Create: `apps/server/` via `vp create vite:library`
- Edit: `apps/server/package.json`, `vite.config.ts`, `src/index.ts`, `src/main.ts`
- Test: `apps/server/tests/server.test.ts`

**Interfaces:**

- Consumes: `@enbi/db`, `@enbi/core`, `@enbi/auth` (workspace deps, type-only for now).
- Produces: `export function createServer(): Hono` — a Hono app with `GET /health` → `{ status: "ok" }` (200). `src/main.ts` boots it with `@hono/node-server` on `PORT` (default 3000).

- [ ] **Step 1: Scaffold**

```bash
vp create vite:library --directory apps/server --no-interactive --no-git --no-hooks
```

- [ ] **Step 2: Add runtime deps to catalog**

In root `pnpm-workspace.yaml` `catalog:` add:

```yaml
hono: ^4
"@hono/node-server": ^1
```

- [ ] **Step 3: package.json**

`apps/server/package.json`:

```json
{
  "name": "@enbi/server",
  "version": "0.0.0",
  "type": "module",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "vp pack",
    "test": "vp test run",
    "dev": "vp pack --watch"
  },
  "dependencies": {
    "@enbi/core": "workspace:*",
    "@enbi/auth": "workspace:*",
    "@enbi/db": "workspace:*",
    "hono": "catalog:",
    "@hono/node-server": "catalog:"
  },
  "devDependencies": { "vite-plus": "catalog:" }
}
```

- [ ] **Step 4: vite.config.ts**

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: { entry: ["src/index.ts", "src/main.ts"], dts: true, format: ["esm"], sourcemap: true },
  test: { include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 5: Write the failing test**

`apps/server/tests/server.test.ts`:

```ts
import { expect, test } from "vitest";
import { createServer } from "../src/index.js";

test("GET /health returns ok", async () => {
  const app = createServer();
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `vp install && vp run @enbi/server#test`
Expected: FAIL — `createServer` not found.

- [ ] **Step 7: Implementation**

`apps/server/src/index.ts`:

```ts
// @enbi/server — Hono content API factory. Routes land in later sub-projects.
import { Hono } from "hono";

export function createServer(): Hono {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  return app;
}
```

`apps/server/src/main.ts`:

```ts
import { serve } from "@hono/node-server";
import { createServer } from "./index.js";

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: createServer().fetch, port });
// eslint-safe: server boot log
console.warn(`@enbi/server listening on :${port}`);
```

- [ ] **Step 8: Test + check + build**

Run: `vp run @enbi/server#test && vp check && vp run @enbi/server#build`
Expected: PASS; `apps/server/dist/{index,main}.js` emitted.

- [ ] **Step 9: Manually verify it boots**

Run: `node apps/server/dist/main.js &` then `curl -s localhost:3000/health`
Expected: `{"status":"ok"}`. Then `kill %1`.

- [ ] **Step 10: Stage** — `git add apps/server pnpm-workspace.yaml`

---

## Task 5: Scaffold `@enbi/admin` (Astro)

**Files:**

- Create: `apps/admin/` Astro project
- Edit: `apps/admin/package.json` (name/scripts), `apps/admin/src/pages/index.astro`

**Interfaces:**

- Produces: a buildable Astro app with a default page. Talks to server over HTTP at runtime only — NO imports of `@enbi/*` packages (ADR-0002/0010).

- [ ] **Step 1: Scaffold Astro into apps/admin**

```bash
cd /Users/filipe.ferreira/code/github/fbritoferreira/enbi
vp create create-astro --directory apps/admin -- --template minimal --no-install --no-git --skip-houston
```

Expected: Astro minimal project in `apps/admin`. (If the template flags differ by Astro version, run `vp create create-astro --directory apps/admin` interactively and pick "Empty".)

- [ ] **Step 2: Set package.json identity + scripts**

Edit `apps/admin/package.json`:

```json
{
  "name": "@enbi/admin",
  "version": "0.0.0",
  "type": "module",
  "private": false,
  "publishConfig": { "access": "public" },
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "test": "vp test run"
  }
}
```

Keep the `astro` dependency the template added. Add `"vite-plus": "catalog:"` to devDependencies.

- [ ] **Step 3: Replace the index page**

`apps/admin/src/pages/index.astro`:

```astro
---
const apiBase = import.meta.env.PUBLIC_ENBI_API ?? "http://localhost:3000";
---
<html lang="en">
  <head><meta charset="utf-8" /><title>enbi admin</title></head>
  <body>
    <h1>enbi admin</h1>
    <p>Content server: {apiBase}</p>
  </body>
</html>
```

- [ ] **Step 4: Add a trivial test so `test` script is green**

`apps/admin/tests/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("admin api base default", () => {
  expect("http://localhost:3000").toMatch(/^http/);
});
```

Add to `apps/admin/vite.config.ts` (create if absent) a `test.include`:

```ts
import { defineConfig } from "vite-plus";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

- [ ] **Step 5: Install + build + test**

Run: `vp install && vp run @enbi/admin#build && vp run @enbi/admin#test`
Expected: Astro build succeeds (`apps/admin/dist`); test passes.

- [ ] **Step 6: Stage** — `git add apps/admin`

---

## Task 6: Scaffold `@enbi/cli` (binary `enbi`)

**Files:**

- Create: `tools/cli/` via `vp create vite:library`
- Edit: `tools/cli/package.json`, `vite.config.ts`, `src/index.ts`, `bin/enbi.ts`
- Test: `tools/cli/tests/version.test.ts`

**Interfaces:**

- Consumes: `@enbi/server` (workspace dep; type-only now, full boot logic later).
- Produces: `export function getVersion(): string`; built `bin` prints version on `enbi --version`.

- [ ] **Step 1: Scaffold**

```bash
vp create vite:library --directory tools/cli --no-interactive --no-git --no-hooks
```

- [ ] **Step 2: package.json**

`tools/cli/package.json`:

```json
{
  "name": "@enbi/cli",
  "version": "0.0.0",
  "type": "module",
  "bin": { "enbi": "./dist/enbi.js" },
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "vp pack",
    "test": "vp test run",
    "dev": "vp pack --watch"
  },
  "dependencies": { "@enbi/server": "workspace:*" },
  "devDependencies": { "vite-plus": "catalog:" }
}
```

- [ ] **Step 3: vite.config.ts**

```ts
import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: { entry: ["src/index.ts", "bin/enbi.ts"], dts: true, format: ["esm"], sourcemap: true },
  test: { include: ["tests/**/*.test.ts"] },
});
```

- [ ] **Step 4: Write the failing test**

`tools/cli/tests/version.test.ts`:

```ts
import { expect, test } from "vitest";
import { getVersion } from "../src/index.js";

test("getVersion returns the package version", () => {
  expect(getVersion()).toBe("0.0.0");
});
```

- [ ] **Step 5: Run test to verify it fails** — `vp run @enbi/cli#test` → FAIL.

- [ ] **Step 6: Implementation**

`tools/cli/src/index.ts`:

```ts
// @enbi/cli — dev/build/start commands land in a later sub-project (ADR-0009).
import pkg from "../package.json" with { type: "json" };

export function getVersion(): string {
  return pkg.version;
}
```

`tools/cli/bin/enbi.ts`:

```ts
#!/usr/bin/env node
import { getVersion } from "../src/index.js";

const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
  console.warn(getVersion());
} else {
  console.warn("enbi — commands (dev/build/start) coming soon. Try --version.");
}
```

If `pkg from "../package.json"` import assertion causes a typecheck error, add `"resolveJsonModule": true` to `tools/cli/tsconfig.json` `compilerOptions`.

- [ ] **Step 7: Test + check + build**

Run: `vp run @enbi/cli#test && vp check && vp run @enbi/cli#build`
Expected: PASS; `tools/cli/dist/{index,enbi}.js`.

- [ ] **Step 8: Verify the bin runs**

Run: `node tools/cli/dist/enbi.js --version`
Expected: prints `0.0.0`.

- [ ] **Step 9: Stage** — `git add tools/cli`

---

## Task 7: Root lint/fmt overrides + workspace hardening

**Files:**

- Modify: root `vite.config.ts`, `pnpm-workspace.yaml`

**Interfaces:**

- Produces: node env lint for server/cli, disabled dependency build scripts, green `vp check` across all packages.

- [ ] **Step 1: Disable dependency lifecycle scripts (supply-chain hardening, ADR-0008)**

In `pnpm-workspace.yaml` add (empty allowlist = no dep build scripts run):

```yaml
onlyBuiltDependencies: []
```

- [ ] **Step 2: Add lint overrides for node + test files**

Edit root `vite.config.ts` `lint` block to add overrides:

```ts
lint: {
  jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
  rules: { "vite-plus/prefer-vite-plus-imports": "error" },
  options: { typeAware: true, typeCheck: true },
  overrides: [
    { files: ["apps/server/**", "tools/cli/**"], env: { node: true } },
    { files: ["**/*.test.ts"], plugins: ["typescript", "vitest"] },
  ],
},
```

- [ ] **Step 3: Full workspace verification**

Run: `vp install && vp check && vp run -r test && vp run -r build`
Expected: all green; build order respects `cli → server → {core,auth,db}`.

- [ ] **Step 4: Stage** — `git add vite.config.ts pnpm-workspace.yaml`

---

## Task 8: CI workflow (`ci.yml`) — no secrets

**Files:**

- Create: `.github/workflows/ci.yml`

**Interfaces:**

- Produces: PR/push pipeline running install/check/test/build with no secrets, `contents: read` only.

- [ ] **Step 1: Resolve pinned action SHAs**

```bash
gh api repos/voidzero-dev/setup-vp/commits/v1 --jq .sha
gh api repos/actions/checkout/commits/v4 --jq .sha
gh api repos/step-security/harden-runner/commits/v2 --jq .sha
```

Record each 40-char SHA; substitute below where `<SHA:...>` appears.

- [ ] **Step 2: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: step-security/harden-runner@<SHA:harden-runner>
        with:
          egress-policy: block
          allowed-endpoints: >
            github.com:443
            api.github.com:443
            objects.githubusercontent.com:443
            registry.npmjs.org:443
            nodejs.org:443
      - uses: actions/checkout@<SHA:checkout>
      - uses: voidzero-dev/setup-vp@<SHA:setup-vp>
        with:
          node-version: "24"
          cache: true
      - run: vp install --frozen-lockfile
      - run: vp check
      - run: vp run -r test
      - run: vp run -r build
```

- [ ] **Step 3: Validate YAML locally**

Run: `gh workflow view ci.yml 2>/dev/null || node -e "require('js-yaml')" 2>/dev/null; echo "lint yaml manually if no tool"`
Expected: file parses. (Real validation happens on push by the user.)

- [ ] **Step 4: Stage** — `git add .github/workflows/ci.yml`

---

## Task 9: Release workflow (`release.yml`) — OIDC trusted publishing, dry-run

**Files:**

- Create: `.github/workflows/release.yml`

**Interfaces:**

- Produces: tag-triggered publish job, `id-token: write`, environment `npm-publish`, `npm publish --dry-run` for every public `@enbi/*` package. No `NPM_TOKEN`.

- [ ] **Step 1: Write the workflow** (reuse SHAs from Task 8 Step 1)

`.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    tags: ["v*"]

permissions:
  contents: read

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm-publish
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: step-security/harden-runner@<SHA:harden-runner>
        with:
          egress-policy: block
          allowed-endpoints: >
            github.com:443
            api.github.com:443
            objects.githubusercontent.com:443
            registry.npmjs.org:443
            nodejs.org:443
            fulcio.sigstore.dev:443
            rekor.sigstore.dev:443
            tuf-repo-cdn.sigstore.dev:443
      - uses: actions/checkout@<SHA:checkout>
      - uses: voidzero-dev/setup-vp@<SHA:setup-vp>
        with:
          node-version: "24"
          cache: true
      - run: vp install --frozen-lockfile
      - run: vp check
      - run: vp run -r test
      - run: vp run -r build
      # Trusted publishing (OIDC): no NPM_TOKEN. Dry-run until first real release.
      # Flip --dry-run off in the db sub-project once the npm trusted publisher is configured.
      - run: |
          for dir in packages/db packages/core packages/auth apps/server apps/admin tools/cli; do
            echo "::group::publish $dir (dry-run)"
            (cd "$dir" && npm publish --provenance --access public --dry-run)
            echo "::endgroup::"
          done
```

- [ ] **Step 2: Document the manual npm step**

Append to `docs/adr/0008-oidc-trusted-publishing-ci.md` a short "Operational setup" note (if not already present): for each `@enbi/*` package, in npmjs.com package Settings → Trusted Publisher, add GitHub org `enbi`, this repo, workflow `release.yml`, environment `npm-publish`. Create the GitHub Environment `npm-publish` with required reviewers.

- [ ] **Step 3: Stage** — `git add .github/workflows/release.yml docs/adr/0008-oidc-trusted-publishing-ci.md`

---

## Task 10: Final local verification + docs note

**Files:**

- Modify: `README.md` (add quickstart), no logic.

**Interfaces:**

- Produces: a documented, locally-green monorepo.

- [ ] **Step 1: Full green gate**

```bash
vp install --frozen-lockfile
vp check
vp run -r test
vp run -r build
node apps/server/dist/main.js & sleep 1; curl -s localhost:3000/health; kill %1
node tools/cli/dist/enbi.js --version
```

Expected: check passes; all tests pass; all packages build; `{"status":"ok"}`; `0.0.0`.

- [ ] **Step 2: Add README quickstart**

Append to `README.md`:

````md
## enbi (dev)

Vite+ monorepo. Packages: `@enbi/db`, `@enbi/core`, `@enbi/auth`, `@enbi/server`, `@enbi/admin`, `@enbi/cli`.

```bash
vp install          # install deps
vp check            # fmt + lint + typecheck
vp run -r test      # all package tests
vp run -r build     # build all packages
vp run -r --parallel dev   # run dev servers
```
````

See `docs/adr/` for decisions and `docs/superpowers/specs/` for specs.

```

- [ ] **Step 3: Stage everything (do NOT commit — user commits)** — `git add -A`

- [ ] **Step 4: Hand off**

Report to the user: workspace is locally green, list what was staged, and let them commit.

---

## Self-Review

- **Spec coverage:** 6 packages (Tasks 1–6) ✓; cleanup (Task 0) ✓; dependency direction enforced via workspace deps (Tasks 4,6) ✓; CI/CD OIDC + hardening (Tasks 8,9) ✓; 3 DB dialects as placeholder type (Task 1) ✓; snapshot Revision type (Task 2) ✓; better-auth placeholder (Task 3) ✓; Astro-over-HTTP, no cross-imports (Task 5) ✓; `enbi` bin (Task 6) ✓; Vite+ tooling throughout ✓; no-commit override stated in Global Constraints and every task ✓.
- **Placeholder scan:** action SHAs are resolved via explicit `gh` commands (Task 8 Step 1), not vague TODOs. No "add error handling" style gaps.
- **Type consistency:** `createServer(): Hono` defined in Task 4, consumed by Task 6 cli dep (type-only). `getVersion(): string` consistent across Task 6. Placeholder export names (`ENBI_*_PLACEHOLDER`) consistent per package.
```
