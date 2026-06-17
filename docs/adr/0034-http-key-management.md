# 34. HTTP API-key management, admin-gated, with first-user bootstrap

- Status: Accepted
- Date: 2026-06-18

## Context

API keys were CLI-only (`enbi keys`). The admin UI and authenticated super-admins need to manage
keys over HTTP. We also need a way to _get_ an admin without hand-editing the database.

## Decision

- **Endpoints** under the reserved `admin_` namespace (ADR-0033): `GET /api/admin_keys`,
  `POST /api/admin_keys` (`{ role, label? }` → `{ id, key }`, plaintext once), `DELETE /api/admin_keys/:id`.
- **Authorization** via a **`keys` permission resource** (ADR-0017). A new
  `authorizeResource(auth, roles, resourceKey, action, headers)` generalizes the route guard; key
  routes use resource `"keys"` with **no public bypass**. `admin: "*"` satisfies it; a scoped role
  can be granted `{ keys: ["read","create","delete"] }`.
- **First-user bootstrap:** the first user created is promoted to `admin` (later users get the
  default role), via a better-auth `databaseHooks.user.create.before` that checks
  `adapter.count({ model: "user" }) === 0`. So the initial signup can immediately manage keys.

## Consequences

- **Good:** keys are manageable from the (future) admin UI and by super-admins over HTTP, reusing the
  existing RBAC + key helpers; no manual DB edit to bootstrap the first admin; CLI `enbi keys` still
  works for machine/ops use.
- **Cost:** the routes are auth-gated mutations (must stay behind the `keys` permission); the
  first-user rule means the very first signup is privileged — fine for self-hosted single-tenant, to
  revisit if multi-tenant. Couples to better-auth's `databaseHooks` + adapter `count`.

## Alternatives considered

- **CLI-only key management:** safe but blocks the admin UI and remote ops. Rejected (we keep the CLI
  too).
- **Seed an admin via env/config instead of first-user:** also viable, but first-user-wins is the
  least-friction bootstrap for a fresh install. Could add an env override later.
