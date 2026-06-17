# 13. Adopt harden-runner in audit mode before switching to egress block

- Status: Accepted
- Date: 2026-06-17

## Context

ADR-0008 mandates `step-security/harden-runner` with `egress-policy: block` to contain
exfiltration. The first pushed CI run failed before building: `setup-vp` installs Vite+ by
curling `https://viteplus.dev/install.sh` (fallback `raw.githubusercontent.com`), and the build
then downloads vp's tool binaries (rolldown, oxlint, oxfmt, tsdown, tsgo). Our initial block
allowlist omitted `viteplus.dev` and `raw.githubusercontent.com`, so every install attempt hit
`curl: (7) Failed to connect ... port 443` and the job died.

The full set of endpoints the vp installer and tool downloads touch is not reliably knowable in
advance. A guessed block allowlist fails repeatedly, one missing host at a time.

## Decision

Adopt harden-runner the way its own docs recommend: run **`egress-policy: audit` first**. Audit
mode allows traffic and records every endpoint the job contacts in the run's security insights.
Once a real run's audit report confirms the complete endpoint set, flip both `ci.yml` and
`release.yml` to `egress-policy: block` with that verified allowlist. The workflows already carry
the known-required endpoints (`viteplus.dev`, `raw.githubusercontent.com`, `registry.npmjs.org`,
GitHub hosts, `nodejs.org`, and sigstore hosts for release) so the switch is a one-line change.

## Consequences

- **Good:** CI is green and we get an authoritative endpoint list instead of guessing; the switch to block is evidence-based and won't whack-a-mole.
- **Cost:** until the flip, egress is monitored but not enforced — a deliberately temporary, documented weakening of ADR-0008's block posture. Tracked as the gate before block.
- **Follow-up:** after the first successful audit run, review the insights, finalize the allowlist, and set `egress-policy: block`. Supersede this ADR's "audit" stance at that point.

## Alternatives considered

- **Keep `block` and keep adding endpoints reactively:** each push fails on the next missing host; slow and opaque. Rejected.
- **Drop harden-runner entirely:** abandons the exfiltration containment ADR-0008 requires. Rejected.
