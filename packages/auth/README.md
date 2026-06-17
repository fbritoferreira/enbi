# @enbi/auth

Authentication + RBAC for [enbi](https://enbi-cms.com), built on
[better-auth](https://better-auth.com).

- `createAuth(ctx, authConfig)` — better-auth with the Drizzle adapter: email/password, social
  (GitHub/Google), SSO via genericOAuth, and the admin plugin (user `role`).
- `authSchema(authConfig, dialect)` — better-auth's tables translated to Drizzle so migrations create
  them in one pipeline.
- **RBAC** — pure `can(roles, role, collection, action)`; anonymous resolves to the `public` role.
- **API keys** — `issueApiKey` / `listApiKeys` / `revokeApiKey` (only a hash is stored) and an
  `apiKeyProvider`; `composeProviders` tries API key then session.

Consumed by `@enbi/server` behind an `AuthProvider` interface. Part of the enbi framework — see the
[repo](https://github.com/fbritoferreira/enbi). GPL-2.0-only.
