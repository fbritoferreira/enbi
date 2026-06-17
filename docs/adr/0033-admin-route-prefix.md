# 33. System routes are namespaced under `admin_`

- Status: Accepted
- Date: 2026-06-18

## Context

Content collections are served at `/api/:collection` (ADR-0016). System endpoints — better-auth and
(soon) API-key management — sit on the same `/api` surface. Without a reserved namespace, a user
collection named `auth` or `keys` would collide with the system routes.

## Decision

System routes are namespaced with an `admin_` prefix on the collection segment:

- better-auth → `/api/admin_auth/*` (better-auth's `basePath` is set to match; one constant
  `AUTH_BASE_PATH` in `@enbi/auth` is the single source of truth for both the mount and better-auth).
- HTTP API-key management (next sub-project) → `/api/admin_keys`.

Collection names may **not** start with `admin_` — `collection()` throws an `EnbiError("config", …)`
if one does, so the reserved namespace can't be shadowed.

## Consequences

- **Good:** no collision between user content and system routes; `admin_*` clearly reads as
  framework/admin surface; one constant keeps the mount and better-auth's `basePath` in sync.
- **Cost:** the auth base path is no longer the better-auth default `/api/auth` — clients/SDKs must
  point at `/api/admin_auth`; documented in the READMEs. `admin_` is a reserved collection-name prefix.

## Alternatives considered

- **Separate base path (e.g. `/admin/...` outside `/api`):** also works, but keeping everything under
  `/api` with a name prefix is simpler for one router + one auth/CORS surface. Rejected.
- **No prefix, document the collision risk:** fragile — a user collection named `auth` would silently
  break login. Rejected.
