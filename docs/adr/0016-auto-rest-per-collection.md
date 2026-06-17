# 16. The content API is auto-generated REST per collection

- Status: Accepted
- Date: 2026-06-17

## Context

The Hono server must expose content operations. Options: auto-generated REST routes per registered
collection; typed RPC endpoints (Hono RPC) for end-to-end types into the admin; or REST now with a
typed client layered later.

## Decision

Generate REST routes per registered collection:
`GET/POST /api/:collection`, `GET/PUT/DELETE /api/:collection/:id`,
`GET /api/:collection/:id/revisions`, `POST /api/:collection/:id/restore`, plus `/health` and
`/api/auth/*`. A typed client over these is deferred to the admin sub-project.

## Consequences

- **Good:** conventional, third-party-friendly contract; uniform per collection; easy for the Astro
  admin (over HTTP, ADR-0002) and external consumers; revision/restore are first-class routes.
- **Cost:** no compile-time end-to-end types yet (added later via a generated client); REST is less
  ergonomic than RPC for the admin in the interim.

## Alternatives considered

- **RPC-only (Hono RPC):** great admin DX, worse for external/third-party API consumers and less
  conventional. Rejected as the primary contract.
- **REST + typed client now:** the client belongs with the admin work; building it now is premature.
  Deferred.
