// Boots a mock OIDC provider (navikt mock-oauth2-server) in a testcontainer and
// exports its discovery URL via env BEFORE Playwright's webServer (`enbi start`)
// launches, so the SSO provider config can point at it. Docker-only: if the
// container can't start (e.g. Podman locally), we skip the SSO spec rather than
// fail (same constraint as the cross-dialect suite, ADR-0035).
import { GenericContainer, Wait } from "testcontainers";

// Pinned: the mock's login-page/claim contract is version-sensitive.
const IMAGE = "ghcr.io/navikt/mock-oauth2-server:2.1.10";
const ISSUER_ID = "default";

export default async function globalSetup(): Promise<() => Promise<void>> {
  try {
    const container = await new GenericContainer(IMAGE)
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp(`/${ISSUER_ID}/.well-known/openid-configuration`, 8080))
      .withStartupTimeout(120_000)
      .start();

    const base = `http://${container.getHost()}:${container.getMappedPort(8080)}/${ISSUER_ID}`;
    process.env.ENBI_E2E_SSO_ISSUER = base;
    process.env.ENBI_E2E_SSO_DISCOVERY = `${base}/.well-known/openid-configuration`;
    process.env.ENBI_E2E_SSO_READY = "1";
    return async () => {
      await container.stop();
    };
  } catch (error) {
    // No Docker (Podman locally) — leave ENBI_E2E_SSO_READY unset; the spec skips.
    console.warn(`SSO e2e: mock IdP unavailable, skipping SSO spec: ${String(error)}`);
    return async () => {};
  }
}
