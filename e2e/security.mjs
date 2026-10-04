// Account security regression. Run after full-case.mjs and controls.mjs.
import { chromium } from "playwright";
import { authenticator } from "otplib";
import { readFileSync } from "node:fs";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const secrets = JSON.parse(readFileSync(`${process.env.SHOTS_DIR ?? "./e2e/screens"}/mfa-secrets.json`, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
const fail = (message) => { throw new Error(message); };
const flash = () => page.locator('[role="status"]').first().textContent();
async function press(locator) {
  const posted = page.waitForResponse(r => r.request().method() === "POST");
  await locator.click();
  await posted;
  await page.waitForLoadState("networkidle");
}
async function passwordLogin(email, password) {
  await page.context().clearCookies();
  await page.goto(`${base}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL(url => url.pathname !== "/login");
}

try {
  await passwordLogin("admin@example.test", "admin-password-123");
  await page.fill("#code", authenticator.generate(secrets.admin));
  await page.click("button[type=submit]");
  await page.waitForURL(`${base}/`);
  await page.goto(`${base}/team`);
  const add = page.locator("form", { has: page.locator('input[name="email"]') });
  const email = `security-${Date.now()}@example.test`;
  const initial = "regression-initial-password";
  const replacement = "regression-replacement-password";
  await add.locator('input[name="name"]').fill("Security regression user");
  await add.locator('input[name="email"]').fill(email);
  await add.locator('input[name="password"]').fill(initial);
  await press(add.locator("button[type=submit]"));
  if (decodeURIComponent(page.url()).includes(initial)) fail("Initial password leaked into URL");
  if (!(await flash()).includes("Account created")) fail("Account was not created");
  console.log("✓ Account creation keeps the initial password out of the URL");

  await passwordLogin(email, initial);
  await page.waitForURL(/\/security/);
  await page.goto(`${base}/cases`);
  await page.waitForURL(/\/security/);
  const denied = await page.request.get(`${base}/api/files/00000000-0000-0000-0000-000000000001`);
  if (denied.status() !== 401) fail("Initial-password account could download files");
  const secret = (await page.locator("code").first().textContent()).trim();
  const staleCookies = await page.context().cookies();
  await page.fill('input[name="code"]', authenticator.generate(secret));
  await press(page.getByRole("button", { name: "Turn on two-factor login" }));
  await page.goto(`${base}/cases`);
  await page.waitForURL(/\/security/);
  await page.fill('input[name="current"]', initial);
  await page.fill('input[name="next"]', replacement);
  await press(page.getByRole("button", { name: "Change password" }));
  await page.goto(`${base}/cases`);
  await page.waitForURL(`${base}/cases`);
  console.log("✓ Initial password must be changed before case files can open");

  const stale = await browser.newContext();
  await stale.addCookies(staleCookies);
  const oldPage = await stale.newPage();
  await oldPage.goto(`${base}/cases`);
  await oldPage.waitForURL(/\/login$/);
  await stale.close();
  console.log("✓ Enrolment and password change invalidate old sessions");

  await page.goto(`${base}/security?setup=1`);
  const nextSecret = (await page.locator("code").first().textContent()).trim();
  // Bypass required form fields to test the server gate, not HTML validation.
  await page.locator('input[name="currentPassword"]').evaluate(input => input.removeAttribute("required"));
  await page.locator('input[name="currentCode"]').evaluate(input => input.removeAttribute("required"));
  await page.fill('input[name="code"]', authenticator.generate(nextSecret));
  await press(page.getByRole("button", { name: "Replace authenticator" }));
  if (!(await flash()).includes("existing authenticator")) fail("Replacement accepted without the existing factor");
  console.log("✓ Replacing an authenticator requires the existing password and factor");

  await passwordLogin(email, replacement);
  await page.waitForURL(/\/login\/mfa/);
  for (let i = 0; i < 5; i++) {
    await page.fill("#code", "invalid");
    await press(page.locator("button[type=submit]"));
  }
  await page.fill("#code", authenticator.generate(secret));
  await press(page.locator("button[type=submit]"));
  if (!(await flash()).includes("Too many failed codes")) fail("MFA attempt lockout was not enforced");
  console.log("✓ Repeated failed MFA codes lock further attempts");
} finally {
  await browser.close();
}
