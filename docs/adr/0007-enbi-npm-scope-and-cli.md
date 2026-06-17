# 7. `@enbi/*` npm scope and `enbi` CLI binary

- Status: Accepted
- Date: 2026-06-17

## Context

Framework packages need a published namespace and the CLI needs a binary name. The user registered
the npm `enbi` organization.

## Decision

Publish all packages under the **`@enbi/*`** scope (`@enbi/db`, `@enbi/core`, `@enbi/auth`,
`@enbi/server`, `@enbi/admin`, `@enbi/cli`). The CLI exposes the **`enbi`** binary.

## Consequences

- **Good:** clear branded namespace, scope ownership already secured, scoped packages get npm's
  per-org access controls and trusted-publishing config (ADR-0008).
- **Cost:** scoped packages are private by default — must explicitly publish with public access.

## Alternatives considered

- **Unscoped names (`enbi-db`, …):** name-squatting risk, no org grouping. Rejected — scope is owned.
