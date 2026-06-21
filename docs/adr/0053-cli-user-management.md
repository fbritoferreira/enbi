# ADR-0053 — CLI user management: `enbi user create` / `enbi user set-role`

**Status:** Accepted  
**Date:** 2026-06-21

## Context

Before this ADR the only way to create a user was through the admin UI (first signup) or directly via the `/api/admin_auth/sign-up/email` HTTP endpoint. There was no CLI path to:

1. Create a user from a script or CI pipeline without an HTTP server running.
2. Promote an existing user to a different role without direct database access.

The bootstrap hook (ADR-0034) automatically makes the first registered user an admin, but subsequent users receive the default role. Changing that required either a raw SQL `UPDATE` or spinning up the admin UI — neither is automation-friendly.

## Decision

Add two sub-commands under `enbi user`:

### `enbi user create <email> <password> [--role <role>] [--name <name>]`

Creates a new user. Password hashing is delegated entirely to better-auth: the command constructs a `Request` to the `${AUTH_BASE_PATH}/sign-up/email` endpoint and calls `auth.handler(request)` directly (in-process, no HTTP server needed). This guarantees the password goes through the same bcrypt pipeline that the live sign-up endpoint uses — the CLI never touches the plaintext password itself.

If `--role` is provided, the role is applied immediately after creation via a direct drizzle `UPDATE` on the `user` table (since better-auth's sign-up handler does not accept an arbitrary role field). The bootstrap hook still fires — `--role` is an explicit override on top of whatever role bootstrap would have assigned.

### `enbi user set-role <email> <role>`

Updates the role of an existing user directly via drizzle. Throws `EnbiError("not_found", …)` when no row matches, so callers get a typed error rather than a silent no-op.

Both commands:

- Follow the same `loadConfig → createDb` pattern as `enbi keys`.
- Use `console.warn` for output (consistent with the rest of the CLI).
- Work against any supported dialect (SQLite, Postgres, MySQL) via the dialect-aware `authSchema` helper.

## Consequences

- Scripts and CI pipelines can create and promote users without a running server.
- Password hashing is handled correctly by better-auth's own bcrypt path — no bespoke hashing code in the CLI.
- The `--role` override during create is a deliberate two-step (sign-up then update) because better-auth's sign-up handler validates its own schema and ignores unknown fields.
- Existing in-process sign-up tests (ADR-0034) demonstrated this pattern already works; the CLI simply wraps it.
