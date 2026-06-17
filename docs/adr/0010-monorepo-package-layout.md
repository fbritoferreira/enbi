# 10. Monorepo package layout and dependency direction

- Status: Accepted
- Date: 2026-06-17

## Context

We need an explicit, acyclic package structure so responsibilities are isolated and the framework
boundary (ADR-0001) and admin-over-HTTP rule (ADR-0002) are enforced by the dependency graph, not
convention.

## Decision

Six packages in the existing `apps/* packages/* tools/*` workspaces:

| Path            | Package        | Role                                     |
| --------------- | -------------- | ---------------------------------------- |
| `packages/db`   | `@enbi/db`     | Drizzle config surface + driver adapters |
| `packages/core` | `@enbi/core`   | Versioning / history engine              |
| `packages/auth` | `@enbi/auth`   | better-auth wiring                       |
| `apps/server`   | `@enbi/server` | Hono content API                         |
| `apps/admin`    | `@enbi/admin`  | Astro admin UI                           |
| `tools/cli`     | `@enbi/cli`    | `enbi` CLI                               |

Dependency direction (acyclic):

```
cli ──▶ server ──▶ core
                └─▶ auth
                └─▶ db
admin ──(HTTP only)──▶ server
```

`admin` must not import server/core/auth/db at build time.

## Consequences

- **Good:** each unit has one purpose and a defined interface; the graph enforces the framework and
  admin boundaries; matches existing workspace globs.
- **Cost:** cross-cutting concerns must pick a home deliberately rather than leaking across packages.

## Alternatives considered

- **Single package with internal folders:** simpler but no enforced boundaries, can't publish/version
  subsystems independently. Rejected.
- **`admin` importing server packages:** breaks the HTTP boundary (ADR-0002). Rejected.
