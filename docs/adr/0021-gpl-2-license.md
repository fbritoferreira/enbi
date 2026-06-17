# 21. License the project under GPL-2.0-only

- Status: Accepted
- Date: 2026-06-17

## Context

The packages were scaffolded as MIT (template default). The project owner chose a copyleft license.

## Decision

License enbi under **GNU General Public License v2.0 (GPL-2.0-only)**. The canonical license text
lives in `/LICENSE`; every package's `package.json` `license` field is `GPL-2.0-only` (SPDX), and
the root `package.json` carries it too. Contributions are accepted under the same license, enforced
by a CLA (ADR-0022).

## Consequences

- **Good:** strong copyleft — downstream distributors of modified versions must release source under
  the same terms; aligns with the owner's intent.
- **Cost:** GPL-2.0 is more restrictive for consumers than MIT (e.g. linking/distribution
  obligations); some companies avoid GPL dependencies. This is an accepted, deliberate trade-off.
- All published `@enbi/*` packages declare `GPL-2.0-only`; npm shows the license accordingly.

## Alternatives considered

- **MIT / Apache-2.0 (permissive):** wider adoption, but no copyleft. Rejected per owner's choice.
- **GPL-3.0 / AGPL-3.0:** stronger/network copyleft; owner specified v2. Not chosen.
- **LGPL-2.1:** weaker copyleft for library linking; owner specified GPL v2. Not chosen.
