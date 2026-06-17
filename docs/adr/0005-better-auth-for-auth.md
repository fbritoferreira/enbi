# 5. better-auth for all authentication (incl. SSO)

- Status: Accepted
- Date: 2026-06-17

## Context

The CMS needs authentication for the admin and API consumers, including SSO. The user explicitly
asked for better-auth and to let end-users configure it.

## Decision

Use **better-auth** as the single auth foundation, wrapped by `@enbi/auth`. End-users configure
auth (providers, SSO, sessions) through their better-auth config, which enbi consumes.

## Consequences

- **Good:** one well-supported library covers sessions, providers, and SSO; TypeScript-native; fits
  the config-driven framework model (ADR-0001); avoids hand-rolling auth.
- **Cost:** enbi is coupled to better-auth's model and DB expectations; its tables must coexist with
  Drizzle schemas across all three dialects (ADR-0003) — reconciled in the auth sub-project.

## Implementation notes (as built)

- `@enbi/auth` `createAuth(ctx, authConfig)` wires better-auth with the Drizzle adapter, email/
  password, social providers (GitHub/Google), the **admin** plugin (provides the user `role` field),
  and **genericOAuth** for SSO/OIDC (`authConfig.ssoProviders`).
- The server consumes auth behind an `AuthProvider` interface (`authenticate(headers) → Identity`),
  so content/RBAC are testable without booting a real auth backend. `betterAuthProvider(auth)` is the
  production implementation.
- `createAuth` has an explicit `EnbiAuth` return type (the slice we use) so the generated `.d.ts`
  stays portable — the full inferred better-auth type leaks non-nameable zod internals (TS2883).
- **API keys are native (ADR-0020).** The better-auth api-key plugin is absent from the installed
  better-auth (verified in both `1.6.19` and `1.7.0-beta.6`), so API-key auth is implemented in
  `@enbi/auth` (`_api_keys` table, `apiKeyProvider`) behind the same `AuthProvider` interface.
- The project pins `better-auth@1.7.0-beta.6` (per owner request); auth still boots and tests pass.

## Alternatives considered

- **Roll our own / Lucia / Auth.js:** more work or weaker SSO story; user specifically requested
  better-auth. Rejected.
