// Tries to break the review and evidence controls. Run after e2e/full-case.mjs (same accounts).
// Usage: BASE_URL=http://localhost:3000 node e2e/controls.mjs
import { chromium } from "playwright";
import { authenticator } from "otplib";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "./e2e/screens";
const secrets = JSON.parse(readFileSync(`${SHOTS}/mfa-secrets.json`, "utf8"));
const PEOPLE = {
  analyst: { email: "analyst@example.test", password: "analyst-password-123" },
  reviewer: { email: "reviewer@example.test", password: "reviewer-password-123" },
  admin: { email: "admin@example.test", password: "admin-password-123" },
};
let step = 0;
const log = (m) => console.log(`✓ ${++step}. ${m}`);
const fail = (m) => {
  throw new Error(m);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on("dialog", (d) => d.accept());

const flash = () => page.evaluate(() => document.querySelector('[role="status"]')?.textContent?.trim() ?? "");
async function expectFlash(re, what) {
  await page.locator('[role="status"]').first().waitFor({ timeout: 5000 }).catch(() => {});
  const f = await flash();
  if (!re.test(f)) fail(`${what}: expected ${re}, got "${f}"`);
}
async function press(loc) {
  loc = typeof loc === "string" ? page.locator(loc) : loc;
  const before = await flash();
  const url = page.url();
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 });
  await loc.click();
  await posted;
  await page
    .waitForFunction(([b, u]) => (document.querySelector('[role="status"]')?.textContent?.trim() ?? "") !== b || location.href !== u, [before, url], { timeout: 5000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}
async function login(who) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", PEOPLE[who].email);
  await page.fill("#password", PEOPLE[who].password);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/login\/mfa/);
  await page.fill("#code", authenticator.generate(secrets[who]));
  await page.click("button[type=submit]");
  await page.waitForURL(`${BASE}/`);
}
const statusForm = (to) => page.locator("form", { has: page.locator(`input[name="to"][value="${to}"]`) }).locator("button");
async function newCaseForExistingSupplier(decision) {
  await page.goto(`${BASE}/cases/new`);
  const v = await page.$eval("#counterpartyId", (s) => [...s.options].find((o) => o.text.includes("Mfano"))?.value);
  await page.selectOption("#counterpartyId", v);
  const c = await page.$eval("#clientId", (s) => [...s.options].find((o) => o.text.includes("Demo"))?.value);
  await page.selectOption("#clientId", c);
  await page.fill("#decisionPurpose", decision);
  await page.click('button:has-text("Open case")');
  await page.waitForURL(/\/cases\/[0-9a-f-]+\?tab=intake/);
  return page.url().split("?")[0];
}
async function setCheck(caseUrl, layer, status, evidenceCodes) {
  await page.goto(`${caseUrl}?tab=checks`);
  const s = page.locator(`section#${layer}`);
  await s.locator('select[name="status"]').selectOption(status);
  await s.locator('textarea[name="finding"]').fill(`Controls test finding for ${layer}.`);
  for (const box of await s.locator('input[name="evidenceIds"]').all()) await box.uncheck();
  for (const code of evidenceCodes) await s.locator("label", { hasText: code }).locator("input").check();
  await press(s.locator("button[type=submit]"));
}
async function sendForReview(caseUrl) {
  await page.goto(caseUrl);
  await press(statusForm("AWAITING_HUMAN_QC"));
}
async function passReview(caseUrl) {
  await page.goto(`${caseUrl}?tab=review`);
  for (const box of await page.locator('input[name^="qc_"]').all()) await box.check();
  await press('button:has-text("Pass review")');
  await expectFlash(/Review passed/, "pass review");
}

// A. Analyst opens a second case for the same supplier
await login("analyst");
const c2 = await newCaseForExistingSupplier("Second order from the same supplier");
await page.check('input[name="commissioningAuthorityConfirmed"]');
await press('button:has-text("Save intake")');
await page.goto(c2);
await press(statusForm("INTAKE_COMPLETE"));
await press(statusForm("IN_PROGRESS"));
for (const [src, access] of [["BRS official company search (CR12)", "EXAMINED"], ["KRA iTax TCC checker", "ACCESS_REQUIRED"]]) {
  await page.goto(`${c2}?tab=evidence`);
  await page.fill("#sourceName", src);
  await page.selectOption("#accessResult", access);
  await page.fill("#summary", `${src}: controls test`);
  await press('button:has-text("Log evidence")');
}
await page.goto(`${c2}?tab=bank`);
await page.click('a:has-text("Log bank details")');
await page.waitForURL(/\/payments\/new/);
await page.fill("#beneficiaryName", "Mfano Packaging Supplies Ltd");
await page.fill("#bankName", "Test Bank Kenya");
await page.fill("#account", "9999 8888 7777");
await page.fill("#sourceDescription", "Second order instruction");
await page.click('button:has-text("Log instruction")');
await page.waitForURL(/\/payments\/[0-9a-f-]+$/);
const pay2 = page.url();
await page.fill("#confirmationChannel", "Phone call");
await page.fill("#channelEstablishedHow", "Director's number from the CR12");
await page.fill("#confirmedWithName", "A. Director");
await page.check('input[name="channelIndependent"]');
await press('button:has-text("Record confirmation")');
log("Second case opened for the same supplier with bank details logged");

await login("reviewer");
await page.goto(pay2);
await press('button:has-text("Approve")');
await login("admin");
await page.goto(pay2);
await press('button:has-text("Approve")');
await expectFlash(/Confirmed within scope/, "bank approvals");
log("Bank details confirmed by two other people");

// B. A source that was not examined cannot support "Verified" (fix 4)
await login("analyst");
for (const layer of ["TAX_COMPLIANCE", "DIGITAL_IDENTITY", "REPRESENTATIVE_AUTHORITY", "OPERATIONAL_EXISTENCE", "DOCUMENT_CONSISTENCY", "TRANSACTION_BENEFICIARY"])
  await setCheck(c2, layer, "VERIFIED", ["E01"]);
await setCheck(c2, "LEGAL_IDENTITY", "VERIFIED", ["E02"]);
await page.goto(`${c2}?tab=outcome`);
await page.check('input[value="VERIFIED_WITHIN_SCOPE"]');
await page.fill('textarea[name="outcomeSummary"]', "Controls test summary.");
await press('button:has-text("Save outcome")');
await sendForReview(c2);
await expectFlash(/none of its cited sources was examined/, "unexamined source");
log("A source marked 'access required' cannot support a Verified finding");
await setCheck(c2, "LEGAL_IDENTITY", "VERIFIED", ["E01"]);

// C. Material red flags needs support (fix 5)
await page.goto(`${c2}?tab=outcome`);
if (!(await page.locator('input[value="MATERIAL_RED_FLAGS"]').isDisabled())) fail("Red flags should be disabled with no contradiction");
log("'Material red flags' cannot be chosen without a supporting contradiction");
await sendForReview(c2);
await expectFlash(/Status updated/, "send for review");

// D. A reviewer who edits the case cannot review it (fix 3)
await login("reviewer");
await page.goto(`${c2}?tab=evidence`);
await page.fill("#sourceName", "Reviewer's own note");
await page.fill("#summary", "Added by the reviewer");
await press('button:has-text("Log evidence")');
await login("analyst");
await sendForReview(c2);
await expectFlash(/Status updated/, "resubmit after reviewer edit");
await login("reviewer");
await page.goto(`${c2}?tab=review`);
if (!(await page.content()).includes("You have edited this case")) fail("Reviewer who edited should be blocked");
log("A reviewer who edited the case is blocked from reviewing it");
await login("admin");
await passReview(c2);

// E. Editing shared supplier details in another case re-opens this one (fix 2)
await login("analyst");
const c3 = await newCaseForExistingSupplier("Third order, supplier details being updated");
await page.fill("#tradingNames", "Mfano Packaging (trading name added)");
await press('button:has-text("Save intake")');
await page.goto(c2);
if (!(await page.locator("text=In progress").first().isVisible())) fail("Case 2 should be back in progress after supplier edit in case 3");
log("Editing supplier details in another case sends this case back for review");

// F. A bank-detail change after review cancels the review (fix 1)
await sendForReview(c2);
await login("admin");
await passReview(c2);
await page.goto(pay2);
await page.fill('input[name="decisionNote"]', "Controls test: supplier reported fraud attempt");
await press('button:has-text("Revoke")');
await expectFlash(/revoked/, "revoke");
await page.goto(c2);
if (!(await page.locator("text=In progress").first().isVisible())) fail("Case 2 should be back in progress after bank revocation");
await login("analyst");
await sendForReview(c2);
await expectFlash(/no bank details on this case are confirmed/, "resubmit without confirmed bank");
log("Revoking bank details cancels the review and blocks resubmission");

console.log(`\nAll ${step} control checks passed.`);
await browser.close();
