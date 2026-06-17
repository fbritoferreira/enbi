---
"@enbi/auth": patch
"@enbi/server": patch
---

Record `last_used_at` when an API key authenticates, and return 409 when creating a content entry whose id already exists. Adds a full-stack cross-dialect test suite (SQLite + Postgres/MySQL via testcontainers) exercising generate → migrate → server → content/versioning + auth bootstrap + key management on every dialect.
