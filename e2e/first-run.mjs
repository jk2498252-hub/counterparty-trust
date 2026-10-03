// First-run check for a brand-new install: create the admin, set up two-factor, add a teammate.
// Usage: BASE_URL=http://127.0.0.1:3101 node e2e/first-run.mjs
import { chromium } from "playwright";
import { authenticator } from "otplib";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
const fail = (m) => {
  throw new Error(m);
};

await page.goto(`${BASE}/`);
await page.waitForURL(/\/setup$/);
await page.fill("#name", "Rick Founder");
await page.fill("#email", "rick@example.test");
await page.fill("#password", "first-admin-password");
await page.fill("#confirm", "first-admin-password");
await page.click("button[type=submit]");
await page.waitForURL(/\/security/);
const secret = (await page.locator("code").first().textContent()).trim();
await page.fill('input[name="code"]', authenticator.generate(secret));
await page.click('button:has-text("Turn on two-factor login")');
await page.waitForSelector('text=Two-factor login is on');
console.log("✓ First admin created and two-factor turned on");

await page.goto(`${BASE}/team`);
await page.fill('input[name="name"]', "New Analyst");
await page.fill('input[name="email"]', "new.analyst@example.test");
await page.click('button:has-text("Create account")');
await page.waitForSelector("text=Temporary password");
console.log("✓ Admin added a teammate and got a temporary password");

const again = await browser.newPage();
await again.goto(`${BASE}/setup`);
if (!again.url().endsWith("/login")) fail("Setup page must close once an admin exists");
console.log("✓ Setup page is closed after first use");
await browser.close();
