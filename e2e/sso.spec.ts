// SSO e2e: a full genericOAuth authorization-code login against the mock OIDC
// provider booted in globalSetup. Skips when the mock container is unavailable
// (no Docker / Podman locally); runs on CI. See ADR-0036.
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// The webServer launcher (e2e/start-server.ts) writes this marker after deciding
// whether the mock OIDC container booted. Skip when it didn't (no Docker locally).
function ssoReady(): boolean {
  try {
    const raw = readFileSync("e2e/.tmp/sso-ready.json", "utf8");
    return (JSON.parse(raw) as { ready?: boolean }).ready === true;
  } catch {
    return false;
  }
}

const READY = ssoReady();

// mock-oauth2-server's default `/authorize` renders an interactive login form.
// This is the first cut at its shape; the real selectors are confirmed from CI
// output (the thrown page content reveals them). If the mock auto-redirected,
// there is nothing to submit.
async function completeMockLogin(page: Page): Promise<void> {
  if (page.url().includes("/health")) return;

  const username = page.locator('input[name="username"], input#username').first();
  if (await username.count()) {
    await username.fill("e2e-admin");
    // The mock's default token carries only `sub`/`tid`; better-auth needs an
    // email (and name) to create the user, so inject them via the optional
    // `claims` field the login form exposes.
    const claims = page.locator('[name="claims"]').first();
    if (await claims.count()) {
      await claims.fill('{"email":"e2e-admin@enbi.test","name":"E2E Admin"}');
    }
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    return;
  }

  // Unknown page shape — surface it so CI output reveals the real selectors.
  const html = await page.content();
  throw new Error(`mock login page not recognized; page content was:\n${html.slice(0, 2000)}`);
}

test.describe("SSO via mock OIDC", () => {
  test.skip(!READY, "mock IdP container unavailable (no Docker)");

  test("genericOAuth login creates a user and establishes a session", async ({ page }) => {
    // 1. Initiate sign-in. better-auth's genericOAuth has no dedicated endpoint:
    //    configured SSO providers are driven through the core `/sign-in/social`
    //    route with `provider: <providerId>`. Using page.request keeps the
    //    PKCE/state cookies in the browser context so the callback can complete.
    const init = await page.request.post("/api/admin_auth/sign-in/social", {
      data: { provider: "mock", callbackURL: "/health" },
    });
    expect(init.ok(), `init ${init.status()}: ${await init.text()}`).toBeTruthy();
    const body = (await init.json()) as { url?: string };
    expect(body.url, "expected an authorize redirect URL").toBeTruthy();

    // 2. Walk the mock login (selectors confirmed via CI output).
    await page.goto(body.url as string);
    await completeMockLogin(page);

    // 3. We should land back on the callbackURL with a session set.
    await page.waitForURL("**/health", { timeout: 15_000 });

    // 4. The SSO login created a user and a live session. The user gets the
    //    default role: this server's db is shared with the `api` specs, which
    //    already created users, so the SSO user is NOT the first user — the
    //    first-user→admin bootstrap (ADR-0034) is covered by the @enbi/cli unit
    //    test, which can isolate a fresh db. Here we prove the full SSO flow.
    const session = await page.request.get("/api/admin_auth/get-session");
    expect(session.ok(), `session ${session.status()}: ${await session.text()}`).toBeTruthy();
    const data = (await session.json()) as { user?: { id?: string; role?: string } };
    expect(data.user?.id, "expected a logged-in user").toBeTruthy();
    expect(data.user?.role).toBe("viewer");
  });
});
