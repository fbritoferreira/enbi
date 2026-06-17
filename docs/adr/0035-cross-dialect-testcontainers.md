# 35. Cross-dialect testing with testcontainers

- Status: Accepted
- Date: 2026-06-18

## Context

enbi claims Postgres/SQLite/MySQL support (ADR-0003) but only SQLite was tested. The Postgres/MySQL
code paths — `createDb` drivers, `authSchema` column mapping, `generate`, and the `migrate` apply
`execute` path — had no coverage, so "3 dialects" was unverified.

## Decision

Add a **full-stack cross-dialect integration suite** that runs the real pipeline
(`generate → migrate → createServer → CRUD/revision + auth signup + /api/admin_keys`) against each
dialect. Postgres and MySQL are provisioned with **testcontainers** (`@testcontainers/postgresql`,
`@testcontainers/mysql`); SQLite uses a temp file. A dialect is **skipped** if its container can't
start, so the suite stays green where Docker is unavailable, while CI (Docker present) runs all three.

## Consequences

- **Good:** the three-dialect claim is actually verified end to end on real engines; the previously
  untested `execute` apply path and pg/mysql schema mapping are exercised; one parameterized suite
  also raises SQLite integration coverage.
- **Cost:** tests need Docker and are slower (container boot, ~seconds each) with long timeouts; CI
  pulls images from Docker Hub (egress recorded for the ADR-0013 block flip); new dev-only deps
  (`testcontainers`, the two modules, `pg`, `mysql2`).
- **Podman caveat:** under **Podman** (e.g. some macOS dev setups), the testcontainers DB modules'
  log-based readiness fails (`Log stream ended …`), so Postgres/MySQL **skip** locally there; SQLite
  - the edge-fix tests still run. The Postgres/MySQL paths are verified on **CI** (real Docker). Local
    Podman users need `DOCKER_HOST` + an empty `DOCKER_CONFIG`; the log-wait issue remains.

## Alternatives considered

- **CI service containers + env-gated suite:** lighter in CI, but no real DB locally without manual
  setup; the owner chose testcontainers for parity everywhere Docker exists. Not chosen.
- **Keep SQLite-only + trust dialect-agnostic code:** cheap but leaves the headline multi-dialect
  claim unproven. Rejected.
