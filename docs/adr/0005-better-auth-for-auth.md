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

## Alternatives considered

- **Roll our own / Lucia / Auth.js:** more work or weaker SSO story; user specifically requested
  better-auth. Rejected.
