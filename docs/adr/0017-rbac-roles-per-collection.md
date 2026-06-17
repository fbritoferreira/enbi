# 17. RBAC: roles with per-collection permissions via better-auth access-control

- Status: Accepted
- Date: 2026-06-17

## Context

The CMS needs roles. Options: a fixed global role set (admin/editor/viewer); roles mapped to a
per-collection permission matrix; or full organization/team multi-tenancy.

## Decision

Roles map to per-collection permissions, enforced with better-auth's access-control plugin. A
permission statement's resource is a collection name and its actions are
`read | create | update | delete`. Roles are declared in `enbi.config.ts`:

```ts
roles: {
  admin: "*",
  editor: { posts: ["read","create","update"], media: ["read","create","update"] },
  viewer: "read",
}
```

The server enforces `requirePermission(collection, action)` as Hono middleware on each REST route.

## Consequences

- **Good:** realistic CMS authorization (an editor can write posts but not users); leverages
  better-auth's audited access-control rather than hand-rolled checks; permissions live with config.
- **Cost:** more setup than a fixed enum; statements must be generated from the collection set at
  startup; role/permission tables ride along in migrations.

## Implementation notes (as built)

- The user's **role is stored by better-auth** (admin plugin's `role` field). **Enforcement is
  enbi's**: a pure `can(roles, role, collection, action)` reads the `roles` config and decides. The
  server's `authorize()` middleware calls it on every non-public route. This keeps the decision
  deterministic and unit-testable, and decoupled from better-auth's access-control API surface.
- Anonymous callers resolve to the `public` role (ADR-0019).

## Alternatives considered

- **Fixed global roles:** too coarse for a CMS with mixed content sensitivity. Rejected.
- **Organization/team roles:** multi-tenant, heaviest; overkill for the first slice. Deferred —
  can be added later via better-auth's organization plugin without redoing per-collection RBAC.
