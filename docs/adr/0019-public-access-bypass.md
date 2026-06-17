# 19. Public access: a `public` role and per-collection public actions

- Status: Accepted
- Date: 2026-06-17

## Context

Not all content is private — a CMS commonly serves public pages/posts read-only to anonymous
visitors. Requiring auth on every route would force a login for public content and waste work
running auth middleware where it is not needed.

## Decision

Two complementary mechanisms:

1. **`public` role (default for anonymous).** Callers with no identity are treated as the role
   `public`. What `public` may do is defined in `enbi.config.ts` `roles.public` like any other role
   and enforced by the same `can()` check.
2. **Per-collection public actions.** `collection(table, { public: ["read"] })` (or `public: true`)
   marks actions that **bypass auth entirely** — no `authenticate()` call, no permission check. This
   is the "if it's marked public we don't run auth middleware" path.

The server's `authorize()` checks the collection's public actions first (hard bypass); otherwise it
resolves the role (`identity?.role ?? "public"`) and runs `can()`.

## Consequences

- **Good:** public content needs no auth round-trip; anonymous access is still governed by explicit
  config (`roles.public`) when not hard-bypassed; the two layers cover both "cheap public read" and
  "fine-grained anonymous permissions."
- **Cost:** two ways to express public access — authors must understand that `collection.public`
  skips auth completely while `roles.public` runs the normal gate. Documented in the config.
- A null-identity caller that passes `can()` via `roles.public` yields `userId: null` for authorship
  (revisions record a null author for anonymous writes).

## Alternatives considered

- **Only a `public` role (no bypass):** still runs `authenticate()` for public reads — unnecessary
  work and contradicts the explicit "don't run auth middleware" requirement. Rejected as the sole
  mechanism; kept as the second layer.
- **Only per-collection bypass (no role):** can't express "anonymous may read everything" centrally.
  Rejected as sole mechanism.
