---
"@enbi/db": minor
"@enbi/auth": minor
---

Add `admin.crossSite` config flag: when true, the session cookie is issued as `SameSite=None; Secure` so it is sent on cross-origin fetches from an admin on a different domain. Requires HTTPS. The same-site/different-port setup (Lax + CORS + trustedOrigins) is unaffected.
