# 39. `enbi auth setup` prints a config snippet and seeds `.env.example`

- Status: Accepted
- Date: 2026-06-20

## Context

Configuring a third-party auth provider (GitHub OAuth, Google OAuth, or a generic OIDC provider)
requires:

1. Adding provider-specific options to `enbi.config.ts`.
2. Adding the corresponding environment variables (`CLIENT_ID`, `CLIENT_SECRET`, etc.) to both the
   running environment and `.env.example` (the committed placeholder file).

Developers unfamiliar with better-auth's provider API had to look up the correct option shape,
copy it by hand, and remember to update `.env.example`. Missing a variable from `.env.example`
silently broke onboarding for the next developer on the project.

AST-based editing of `enbi.config.ts` was considered as a way to automate step 1, but the config
file accepts arbitrary TypeScript expressions and the better-auth option objects can be composed in
many ways. Reliable AST mutation of a user-owned TypeScript file is fragile and produces diffs
that are hard to review.

## Decision

`enbi auth setup <github|google|oidc>` is a new CLI sub-command that:

1. **Prints a ready-to-paste config snippet** to stdout — a TypeScript object literal with the
   correct better-auth provider import and option shape for the requested provider. The developer
   copies this into `enbi.config.ts` manually; the CLI does not touch the file.
2. **Seeds `.env.example`** with the environment variables required by that provider. Variables
   already present in `.env.example` are left unchanged (append-missing semantics). Passing
   `--force` overwrites existing entries with the canonical placeholder values.

The CLI does **not** mutate `enbi.config.ts`. AST editing of user-owned TypeScript is fragile
across formatting styles, comment placements, and dynamic expressions; a printed snippet that the
developer reviews and pastes is more reliable and more reviewable.

## Consequences

- **Good:** developers get the correct option shape without consulting documentation; copy-paste
  errors in provider config are eliminated.
- **Good:** `.env.example` is kept in sync automatically; onboarding breakage from missing
  variables is prevented.
- **Good:** no AST manipulation of user files — the CLI cannot corrupt `enbi.config.ts`.
- **Good:** `--force` is a safe escape hatch when placeholder values need to be reset.
- **Trade-off:** the developer must manually paste the printed snippet into `enbi.config.ts`.
  This is intentional (reviewability) but adds a manual step.
- **Limitation:** only `github`, `google`, and `oidc` providers are supported in this iteration;
  additional providers require extending the command's template registry.

## Alternatives considered

- **AST-edit `enbi.config.ts` automatically:** removes the manual paste step but is fragile
  against TypeScript expression diversity and produces hard-to-review automated diffs. Rejected.
- **Generate a separate `auth.config.ts` that is merged at runtime:** avoids touching the user's
  file but introduces a second config surface and import-order coupling. Rejected — a single
  `enbi.config.ts` is the project's established convention (ADR 0018).
- **Interactive wizard (prompt for client ID/secret values):** more user-friendly but writes real
  secrets into committed files if the developer is not careful. Rejected in favour of placeholder
  values that are obviously not real credentials.
