# 14. Content types are Drizzle tables registered through `collection()`

- Status: Accepted
- Date: 2026-06-17

## Context

Users must define custom content types in code (ADR-0001, ADR-0003). The mechanism options:
plain Drizzle tables that enbi infers everything from; a bespoke `defineCollection({fields})` DSL
that generates Drizzle tables; or Drizzle tables wrapped by an enbi registration call.

## Decision

The user authors a normal Drizzle table, then registers it:
`collection(table, { name, title?, versioned?, permissionsKey? })`. Drizzle owns the table shape;
enbi owns behavior (versioning, RBAC, REST, admin hints) attached via the options.

## Consequences

- **Good:** full Drizzle power and types for the user; enbi gets the metadata it needs (title field,
  versioned flag, permission key) without reinventing a schema DSL; the table is a first-class
  Drizzle object usable in migrations and queries.
- **Indexes/constraints pass through unchanged:** because `collection()` stores the user's actual
  Drizzle table object (it does not reconstruct it), anything defined on that table — `index()`,
  `uniqueIndex()`, defaults, foreign keys, composite uniques — is preserved and flows into
  `buildSchema()` → `drizzle-kit` migrations. enbi adds behavior, never rewrites the schema.
- **Cost:** two steps (define + register); enbi must validate that registered tables have a usable
  primary key.

## Alternatives considered

- **Plain Drizzle tables, no registration:** enbi can't learn title/versioned/permissions without a side channel. Rejected.
- **`defineCollection()` DSL generating tables:** duplicates Drizzle's schema language and hides it. Rejected — contradicts "use Drizzle to configure types."
