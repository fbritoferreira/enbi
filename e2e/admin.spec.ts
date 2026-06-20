import { expect, test } from "@playwright/test";

const PWD = "password12345";
const email = `admin-ui-${Date.now()}@e2e.test`;
const SERVER = "http://localhost:3787";

test("admin UI: sign up, log in, CRUD an entry, manage a key", async ({ page, request }) => {
  // First user becomes admin (bootstrap). Sign up directly against the API.
  const signup = await request.post(`${SERVER}/api/admin_auth/sign-up/email`, {
    headers: { origin: SERVER },
    data: { email, password: PWD, name: "Admin UI" },
  });
  expect(signup.ok(), `signup ${signup.status()}: ${await signup.text()}`).toBeTruthy();

  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", PWD);
  await page.click("#login button[type=submit]");
  await page.waitForURL("http://localhost:4321/");

  await expect(page.locator("#list")).toContainText("posts", { timeout: 10_000 });

  const entryId = `ui-${Date.now()}`;
  await page.goto(`/edit?c=posts&id=new`);
  await page.fill("#f_id", entryId);
  await page.fill("#f_title", "hello from ui");
  await page.fill("#f_views", "0");
  await page.click("#form button[type=submit]");
  await page.waitForURL("**/entries**");
  await expect(page.locator("#rows")).toContainText(entryId, { timeout: 10_000 });

  await page.goto("/keys");
  await page.click("#create button[type=submit]");
  await expect(page.locator("#new")).toContainText("New key", { timeout: 10_000 });
});

test("admin UI: users page, revision history, and providers endpoint shape", async ({ page }) => {
  // Tests run in separate browser contexts — re-authenticate before each test.
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", PWD);
  await page.click("#login button[type=submit]");
  await page.waitForURL("http://localhost:4321/");

  // (a) Users page — role management
  await page.goto("/users");
  await page.waitForLoadState("networkidle");

  // The admin email must appear in the users table.
  const rows = page.locator("#rows, table tbody");
  await expect(rows).toContainText(email, { timeout: 10_000 });

  // Find the role input for the admin user row and verify it has a value.
  // users.astro renders inputs with data-userid attribute.
  const roleInput = page.locator("input[data-userid]").first();
  await expect(roleInput).not.toHaveValue("", { timeout: 5_000 });

  // Click the Save button for the first (admin) row and wait for the reload to settle.
  // save triggers location.reload() — use waitForResponse to confirm the reload completed.
  const [saveResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/users") && r.status() === 200),
    page.locator("button[data-userid]").first().click(),
  ]);
  expect(saveResponse.ok()).toBeTruthy();
  // After reload, error div must remain hidden.
  const errorEl = page.locator("#err");
  if ((await errorEl.count()) > 0) {
    await expect(errorEl).toBeHidden();
  }

  // (b) Revisions — create an entry then browse its history
  const revId = `rev-${Date.now()}`;
  await page.goto(`/edit?c=posts&id=new`);
  await page.waitForLoadState("networkidle");
  await page.fill("#f_id", revId);
  await page.fill("#f_title", "revision history test");
  await page.fill("#f_views", "0");
  await page.click("#form button[type=submit]");
  await page.waitForURL("**/entries**");

  await page.goto(`/revisions?c=posts&id=${revId}`);
  await page.waitForLoadState("networkidle");
  const revisionRows = page.locator("table tbody tr");
  await expect(revisionRows).toHaveCount(1, { timeout: 10_000 });

  // (c) Providers endpoint shape — verify JSON structure without browser navigation
  const res = await page.request.get(`${SERVER}/api/admin_providers`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(Array.isArray(body.social)).toBeTruthy();
  expect(Array.isArray(body.sso)).toBeTruthy();
});
