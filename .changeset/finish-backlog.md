---
"@enbi/server": minor
"@enbi/auth": minor
"@enbi/cli": minor
"@enbi/admin": minor
---

Content API gains query params (`limit`/`offset`/`sort`/equality filters) with an `X-Total-Count` header, an admin-only `GET /api/admin_collections` metadata endpoint, and optional CORS + better-auth `trustedOrigins` for a configured admin origin. New `enbi auth setup <github|google|oidc>` scaffolds an auth provider. The Astro admin gains a functional core: login, collections, entry CRUD, and API-key management.
