# 40. CI egress flipped from audit to block with a known-good allowlist

- Status: Accepted
- Date: 2026-06-20

## Context

ADR 0013 introduced `harden-runner` in `audit` mode for the `verify` and `e2e` CI jobs. Audit
mode records outbound network calls but does not block them, which gave observability without
enforcement. The rationale was that the full set of required egress endpoints was not yet known;
blocking prematurely would break CI on undiscovered hosts.

By this point the endpoint set is stable:

- **npm registry** (`registry.npmjs.org`) — package installs.
- **GitHub APIs** (`api.github.com`, `github.com`) — checkout, release, and OIDC token exchange.
- **Testcontainers / Docker Hub** — `auth.docker.io`, `registry-1.docker.io`, `index.docker.io`,
  `production.cloudfront.docker.com` — required to pull database images and the Ryuk reaper
  container used by testcontainers for container lifecycle management.
- **Playwright browser binaries** (`playwright.azureedge.net`) — `playwright install` fetches
  browser archives.

A separate change dropped `--with-deps` from `playwright install`. The `--with-deps` flag
installs system-level apt packages (OS libraries) from Ubuntu mirrors, which are not enumerable in
advance and would require allowing large ranges of CDN IPs under egress block. GitHub-hosted
runners already pre-install the browser library dependencies that Playwright needs, so `--with-deps`
is unnecessary and its removal shrinks the required allowlist to a closed, enumerable set.

## Decision

The `verify` and `e2e` jobs in `.github/workflows/ci.yml` flip `egress-policy` from `audit` to
`block`. The `allowed-endpoints` list is updated to include:

- All previously recorded npm and GitHub endpoints.
- The four Docker Hub endpoints required by testcontainers and Ryuk:
  `auth.docker.io:443`, `registry-1.docker.io:443`, `index.docker.io:443`,
  `production.cloudfront.docker.com:443`.
- The Playwright CDN endpoint for browser binary downloads.

`playwright install` is called **without** `--with-deps` to avoid triggering apt traffic to Ubuntu
mirrors, which cannot be cleanly enumerated.

If a future dependency introduces a new outbound host, CI fails visibly on that job. The fix is to
add the host to the allowlist (with an ADR update or inline comment explaining why), not to revert
to audit mode.

## Consequences

- **Good:** supply-chain exfiltration via a compromised dependency is blocked rather than merely
  logged. Egress block is the intended end-state of the harden-runner progression.
- **Good:** the allowlist documents every host the CI pipeline touches, making security review
  straightforward.
- **Good:** dropping `--with-deps` removes a large, non-enumerable apt dependency surface.
- **Cost:** any new dependency that phones home to an undiscovered host will break CI. This is the
  intended behaviour — the break is a signal, not a bug.
- **Operational:** the allowlist must be kept current. If a host is still missing after a block
  failure, add it to the list after verifying it is legitimate, then re-run CI.

## Alternatives considered

- **Remain in audit mode indefinitely:** provides observability but no enforcement. Rejected now
  that the endpoint set is stable — audit-only is a permanent liability.
- **Allow broad IP ranges for Docker Hub / apt:** avoids enumerating individual hosts but defeats
  the purpose of egress control. Rejected.
- **Keep `--with-deps` and allowlist Ubuntu mirrors:** the Ubuntu mirror pool is large and
  dynamically assigned; a stable allowlist is not feasible. Dropping `--with-deps` is the correct
  fix.
- **Self-host a Docker registry mirror:** eliminates Docker Hub egress entirely but introduces
  significant infrastructure overhead for a project at this scale. Deferred.
