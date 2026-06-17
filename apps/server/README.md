# @enbi/server

The Hono content API for [enbi](https://enbi-cms.com). `createServer(config)` mounts:

- `GET /health`
- `POST /api/admin_auth/*` — better-auth (sessions, social, SSO). System routes are namespaced
  under `admin_` so they never collide with a content collection (ADR-0033).
- Auto-generated REST per collection: `GET/POST /api/:collection`, `GET/PUT/DELETE /api/:collection/:id`,
  `GET /api/:collection/:id/revisions`, `POST /api/:collection/:id/restore`.

Every write is auth-gated (session **or** API key → role → `can()`), versioned (full snapshot), and
honors per-collection public actions. Typed errors map to 401/403/404/422. Usually run via the
`enbi` CLI rather than directly. Part of the enbi framework — see the
[repo](https://github.com/fbritoferreira/enbi). GPL-2.0-only.
