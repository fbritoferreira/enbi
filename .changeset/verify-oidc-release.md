---
"@enbi/db": patch
"@enbi/core": patch
"@enbi/auth": patch
"@enbi/server": patch
"@enbi/admin": patch
"@enbi/cli": patch
---

Harden the release pipeline: publish via pnpm with corepack on PATH, OIDC trusted publishing (no token), and ignore the bot-written CLA signatures file in formatting. First fully-automated, tokenless release.
