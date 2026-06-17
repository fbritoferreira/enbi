# 2. Admin UI is Astro talking to the Hono API over HTTP

- Status: Accepted
- Date: 2026-06-17

## Context

The initial description mentioned both a "hono frontend" and an "astro powered app." These are two
different architectures and we must pick one. The admin needs interactive editing UI but should not
be tightly coupled to server internals (framework model, ADR-0001).

## Decision

`apps/admin` is an **Astro** application. It communicates with `apps/server` (Hono content API)
**only over HTTP** — it does not import server/core/auth/db at build time. There is no second Hono
frontend app.

## Consequences

- **Good:** clean trust boundary (admin is just another API client; same surface third parties use),
  Astro islands give interactivity without a heavy SPA, admin and server can scale/deploy independently.
- **Cost:** all admin capabilities must exist as API endpoints first; no shortcut of reaching into
  server internals.
- **Open risk:** embedding/serving the built Astro admin from a published package booted out of a
  user's `node_modules` (static vs SSR, asset paths) is non-trivial — designed in the admin sub-project.

## Alternatives considered

- **Hono + JSX/HTMX server-rendered admin:** fewer moving parts, but weaker for rich editing UX and
  blurs the API boundary. Rejected.
- **Astro importing server packages directly:** faster initially but couples admin to runtime
  internals, breaking the framework boundary. Rejected.
