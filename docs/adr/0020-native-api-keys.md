# 20. Native API-key auth (better-auth api-key plugin unavailable)

- Status: Accepted
- Date: 2026-06-17

## Context

API-key auth was requested (for programmatic content-API consumers). The better-auth docs document
an api-key plugin, but it is **not present in the installed better-auth builds** — verified
exhaustively in both stable `1.6.19` and `1.7.0-beta.6`: `better-auth/plugins/api-key` is not an
exported subpath, the `plugins` barrel has no `apiKey` symbol, and no `id:"api-key"` plugin exists
anywhere in the dist. We cannot import a plugin that the package does not ship.

## Decision

Implement API keys natively, integrated through the existing `AuthProvider` abstraction:

- `@enbi/db` adds an `_api_keys` table (`id, hashed_key, role, label, created_at, last_used_at`),
  dialect-aware like `_revisions`.
- `@enbi/auth` provides `generateApiKey()` (opaque `enbi_…` token), `hashApiKey()` (SHA-256; only
  the hash is stored), `verifyApiKey()`, `apiKeyProvider(db, table)`, and `composeProviders(...)`.
- The server's default auth is `composeProviders(apiKeyProvider, betterAuthProvider)`: a key
  presented as `x-api-key` or `Authorization: Bearer <key>` is tried first, then a better-auth
  session. The resolved role flows into the same `can()` RBAC.

## Consequences

- **Good:** the feature ships now, on stable better-auth; keys map to roles and reuse the entire
  RBAC + public-access machinery; only hashes are stored; provider composition keeps sessions and
  keys orthogonal and testable.
- **Cost:** we maintain a small auth surface better-auth might later provide; key issuance/rotation
  endpoints and `last_used_at` updates are minimal for now (issued by inserting a row).
- **Migration path:** if a real better-auth api-key plugin becomes available, it can replace
  `apiKeyProvider` behind the same `AuthProvider` interface without touching the server.

## Alternatives considered

- **Pin a better-auth version with the plugin:** none available in this environment (checked stable
  and beta). Rejected as impossible here.
- **Drop API keys:** contradicts the requirement. Rejected.
