---
"@enbi/auth": minor
"@enbi/cli": minor
---

Add `enbi keys` (create/list/revoke) and API-key management helpers (`issueApiKey`/`listApiKeys`/`revokeApiKey`). Fix the better-auth Drizzle adapter to receive the generated schema so session signup/login works against migrated tables. Add Playwright API-level e2e (signup/login/session, API-key, denied paths) that boots the real CLI and runs in CI.
