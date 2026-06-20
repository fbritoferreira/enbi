# 48. Cross-domain admin cookie support

- Status: Accepted
- Date: 2026-06-20

## Context

ADR-0041 added `admin.origin` to `EnbiConfig` and wired CORS + `trustedOrigins`
so the admin UI can call the API with credentials. That solution covers the
common **same-site** case: admin and API on different ports of the same
registered domain (e.g. `localhost:5174` / `localhost:3000`). Browsers allow
`SameSite=Lax` cookies to be sent in that topology because the eTLD+1 matches.

A **truly cross-domain** deployment — admin served from `admin.example.com`,
API from `api.example.com` (or any fully separate domain) — does not benefit
from the Lax default. Browsers refuse to attach a `SameSite=Lax` cookie on
cross-site fetch requests, so the session is never established and all
authenticated API calls fail.

The fix is well-defined by the spec: `SameSite=None; Secure`. The `None` value
explicitly opts the cookie into cross-site sending; `Secure` is required by
browsers whenever `SameSite=None` is set (and implicitly requires HTTPS).

`better-auth` (the auth library used by enbi) exposes exactly the right knobs:
`options.advanced.useSecureCookies` and `options.advanced.defaultCookieAttributes`
are merged into every session cookie it issues.

## Decision

### Config

`EnbiConfig.admin` in `@enbi/db`'s `config.ts` gains an optional boolean field:

```typescript
admin?: { origin?: string; crossSite?: boolean };
```

`crossSite` defaults to `false`. Setting it to `true` opts into cross-domain
session cookies.

### Auth options

`buildAuthOptions` in `@enbi/auth` accepts an optional second parameter `opts`
of type `BuildAuthOpts`:

```typescript
export type BuildAuthOpts = {
  trustedOrigins?: string[];
  crossSite?: boolean;
};

export function buildAuthOptions(authConfig: EnbiAuthConfig, opts?: BuildAuthOpts): EnbiAuthOptions;
```

When `opts.crossSite` is `true`, the returned options include:

```typescript
advanced: {
  useSecureCookies: true,
  defaultCookieAttributes: { sameSite: "none", secure: true },
}
```

When `opts.crossSite` is `false` or absent, `advanced` is omitted entirely —
no behavior change for the same-site case.

`createAuth` gains a fourth parameter `crossSite?: boolean`, which it threads
into `buildAuthOptions`. The `authSchema` migration path calls `buildAuthOptions`
without the second argument; the no-arg call still compiles and behaves
identically (no `advanced` field emitted).

### Server wiring

`apps/server` passes `config.admin?.crossSite` as the new `crossSite` argument
when calling `createAuth`.

## Consequences

- **Good:** cross-domain admin deployments work without any custom middleware.
- **Good:** the same-site/different-port setup is completely unaffected —
  `advanced` is only emitted when `crossSite: true` is set.
- **Good:** the migration schema generation path (`authSchema`) is unaffected —
  `buildAuthOptions` with no opts compiles and behaves identically.
- **Bad:** `crossSite: true` requires HTTPS in production. Operators who enable
  it on HTTP will find that browsers silently drop `SameSite=None; Secure`
  cookies.

## Non-goals

- **Per-cookie configuration** — all session cookies from this auth instance
  share the same `SameSite` policy. Fine-grained per-cookie overrides are not
  provided.
- **Subdomain cookie domains** — setting `Domain=.example.com` to share cookies
  across subdomains is not addressed here (`crossSubDomainCookies` in
  better-auth). That is a separate, orthogonal concern.
- **HTTP development support** — running cross-site cookies over plain HTTP is
  not supported; browsers reject `SameSite=None` on insecure origins.
