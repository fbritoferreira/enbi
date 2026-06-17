---
"@enbi/cli": minor
"@enbi/auth": minor
"@enbi/db": minor
---

Add migrations: `enbi generate` writes versioned migration files (drizzle-kit diff) and `enbi migrate` applies pending ones, tracked in `_enbi_migrations`. better-auth's tables are translated into the drizzle schema (`@enbi/auth` `authSchema` via `getSchema`) and unified with content + `_revisions` + `_api_keys`, so one pipeline migrates everything and `enbi dev` auto-sync now includes session-auth tables too.
