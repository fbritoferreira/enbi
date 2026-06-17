---
"@enbi/cli": minor
---

Implement the `enbi` CLI commands: `dev` (load `enbi.config.ts` via jiti, auto-sync the schema with drizzle-kit push, boot the Hono server, and run the Astro admin), `build` (build the admin), `start` (production server), and a `migrate` stub (filled by the migrations sub-project). Config loading, schema sync, and command routing are covered by tests.
