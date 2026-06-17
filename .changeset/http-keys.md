---
"@enbi/server": minor
"@enbi/auth": minor
---

Add HTTP API-key management at `/api/admin_keys` (`GET` list / `POST` create / `DELETE` revoke), gated by a `keys` permission resource — admin-only (the `read` role shorthand does not grant it). The first user created is promoted to `admin` so a fresh install has a super-admin without a manual DB edit. Covered by server unit tests and Playwright e2e.
