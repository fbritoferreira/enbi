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
