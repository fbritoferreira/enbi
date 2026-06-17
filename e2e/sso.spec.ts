// SSO e2e: a full genericOAuth authorization-code login against the mock OIDC
// provider booted in globalSetup. Skips when the mock container is unavailable
// (no Docker / Podman locally); runs on CI. See ADR-0036.
import { expect, type Page, test } from "@playwright/test";

const READY = process.env.ENBI_E2E_SSO_READY === "1";

// mock-oauth2-server's default `/authorize` renders an interactive login form.
// This is the first cut at its shape; the real selectors are confirmed from CI
// output (the thrown page content reveals them). If the mock auto-redirected,
// there is nothing to submit.
async function completeMockLogin(page: Page): Promise<void> {
  if (page.url().includes("/health")) return;

  const username = page.locator('input[name="username"], input#username').first();
  if (await username.count()) {
    await username.fill("e2e-admin");
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    return;
  }

  // Unknown page shape — surface it so CI output reveals the real selectors.
  const html = await page.content();
  throw new Error(`mock login page not recognized; page content was:\n${html.slice(0, 2000)}`);
}

test.describe("SSO via mock OIDC", () => {
  test.skip(!READY, "mock IdP container unavailable (no Docker)");

  test("genericOAuth login establishes a session; first user is admin", async ({ page }) => {
    // 1. Initiate sign-in. Using page.request keeps better-auth's PKCE/state
    //    cookies in the browser context so the callback can complete.
    const init = await page.request.post("/api/admin_auth/sign-in/oauth2", {
      data: { providerId: "mock", callbackURL: "/health" },
    });
    expect(init.ok(), `init ${init.status()}: ${await init.text()}`).toBeTruthy();
    const body = (await init.json()) as { url?: string };
    expect(body.url, "expected an authorize redirect URL").toBeTruthy();

    // 2. Walk the mock login (selectors confirmed via CI output).
    await page.goto(body.url as string);
    await completeMockLogin(page);

    // 3. We should land back on the callbackURL with a session set.
    await page.waitForURL("**/health", { timeout: 15_000 });

    // 4. Session is established and the first SSO user is admin (bootstrap hook).
    const session = await page.request.get("/api/admin_auth/get-session");
    expect(session.ok(), `session ${session.status()}: ${await session.text()}`).toBeTruthy();
    const data = (await session.json()) as { user?: { id?: string; role?: string } };
    expect(data.user?.id, "expected a logged-in user").toBeTruthy();
    expect(data.user?.role).toBe("admin");
  });
});
