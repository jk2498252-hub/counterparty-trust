// End-to-end walkthrough of one complete case with three people.
// Usage: BASE_URL=http://localhost:3000 node e2e/full-case.mjs
// Needs three users (see README): analyst, reviewer and admin test accounts.
import { chromium } from "playwright";
import { authenticator } from "otplib";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? "./e2e/screens";
mkdirSync(SHOTS, { recursive: true });

const PEOPLE = {
  analyst: { email: "analyst@example.test", password: "analyst-password-123" },
  reviewer: { email: "reviewer@example.test", password: "reviewer-password-123" },
  admin: { email: "admin@example.test", password: "admin-password-123" },
};
const secrets = {};
let step = 0;
const log = (m) => console.log(`✓ ${++step}. ${m}`);
const fail = (m) => {
  throw new Error(m);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
page.on("pageerror", (e) => console.error("Page error:", e.message));
page.on("dialog", (d) => d.accept()); // confirm every "Are you sure?" prompt

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}
async function flash() {
  return page.evaluate(() => document.querySelector('[role="status"]')?.textContent?.trim() ?? "");
}
async function expectFlash(re, what) {
  await page.locator('[role="status"]').first().waitFor({ timeout: 5000 }).catch(() => {});
  const f = await flash();
  if (!re.test(f)) fail(`${what}: expected ${re}, got "${f}"`);
}

// Clicks a submit button and waits until the page shows the result of that action.
async function press(locatorOrSelector) {
  const loc = typeof locatorOrSelector === "string" ? page.locator(locatorOrSelector) : locatorOrSelector;
  const before = await flash();
  const beforeUrl = page.url();
  const posted = page.waitForResponse((r) => r.request().method() === "POST", { timeout: 15000 });
  await loc.click();
  await posted;
  await page
    .waitForFunction(
      ([b, u]) => (document.querySelector('[role="status"]')?.textContent?.trim() ?? "") !== b || location.href !== u,
      [before, beforeUrl],
      { timeout: 5000 },
    )
    .catch(() => {});
  await page.waitForLoadState("networkidle");
}

async function login(who) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`);
  await page.fill("#email", PEOPLE[who].email);
  await page.fill("#password", PEOPLE[who].password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.endsWith("/login"));
  if (page.url().includes("/login/mfa")) {
    await page.fill("#code", authenticator.generate(secrets[who]));
    await page.click("button[type=submit]");
    await page.waitForURL(`${BASE}/`);
  } else if (page.url().includes("/security")) {
    const secret = (await page.locator("code").first().textContent()).trim();
    secrets[who] = secret;
    await page.fill('input[name="code"]', authenticator.generate(secret));
    await press('button:has-text("Turn on two-factor login")');
    await expectFlash(/Two-factor login is on/, "MFA setup");
  }
}

async function submitIn(locator, buttonText) {
  await press(locator.locator(`button:has-text("${buttonText}")`));
}

// 1. Wrong password is refused without saying why
await page.goto(`${BASE}/login`);
await page.fill("#email", PEOPLE.analyst.email);
await page.fill("#password", "wrong-password");
await press("button[type=submit]");
await expectFlash(/incorrect/, "bad login");
log("Wrong password refused");

// 2. Analyst signs in and is forced to set up two-factor login
await login("analyst");
log("Analyst enrolled in two-factor login");

// 3. Open a case
await page.goto(`${BASE}/cases/new`);
await page.fill("#clientName", "Demo Manufacturing Ltd (fictional)");
await page.fill("#legalName", "Mfano Packaging Supplies Ltd (fictional)");
await page.fill("#kraPin", "P000000000X");
await page.fill("#registrationNumber", "PVT-TEST0001");
await page.fill("#decisionPurpose", "First 40% deposit to a new corrugated-packaging supplier");
await page.fill("#amount", "1,800,000");
await page.click('button:has-text("Open case")');
await page.waitForURL(/\/cases\/[0-9a-f-]+\?tab=intake/);
const caseUrl = page.url().split("?")[0];
log(`Case opened at ${caseUrl}`);

// 4. Intake can't complete without commissioning authority
await page.goto(`${caseUrl}`);
await submitIn(page.locator("form", { has: page.locator('input[value="INTAKE_COMPLETE"]') }), "Mark intake complete");
await expectFlash(/authority to commission/, "intake gate");
log("Intake gate blocks missing client authority");

await page.goto(`${caseUrl}?tab=intake`);
await page.check('input[name="commissioningAuthorityConfirmed"]');
await page.fill("#exclusions", "Site visit, beneficial ownership, sanctions screening");
await press('button:has-text("Save intake")');
await expectFlash(/Intake saved/, "save intake");
await page.fill('input[placeholder="Name"]', "J. Otieno");
await page.fill('input[placeholder="Claimed role"]', "Sales manager");
await press('button:has-text("Add representative")');
log("Intake saved with representative");

await page.goto(caseUrl);
await submitIn(page.locator("form", { has: page.locator('input[value="INTAKE_COMPLETE"]') }), "Mark intake complete");
await submitIn(page.locator("form", { has: page.locator('input[value="IN_PROGRESS"]') }), "Start checks");
log("Case moved to In progress");

// 5. Evidence, including a PDF capture and a rejected fake file
const evidenceRows = [
  ["BRS official company search (CR12)", "AUTHORITATIVE", "Name and number match the invoice; status registered. Receipt BRS-TEST-1."],
  ["KRA iTax TCC checker", "AUTHORITATIVE", "TCC valid, expiry 2027-03-31, PIN matches entity."],
  ["Independent call to registered contact", "INDEPENDENT_CONFIRMATION", "Director confirmed J. Otieno's mandate for this order."],
];
for (const [i, [src, cat, summary]] of evidenceRows.entries()) {
  await page.goto(`${caseUrl}?tab=evidence`);
  await page.fill("#sourceName", src);
  await page.selectOption("#category", cat);
  await page.fill("#summary", summary);
  if (i === 0) await page.setInputFiles("#file", { name: "cr12.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% test capture\n") });
  await press('button:has-text("Log evidence")');
  await expectFlash(/Evidence logged/, `evidence ${i + 1}`);
}
await page.goto(`${caseUrl}?tab=evidence`);
await page.fill("#sourceName", "Fake");
await page.fill("#summary", "Should be refused");
await page.setInputFiles("#file", { name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from([0x4d, 0x5a, 0x90, 0, 1, 2]) });
await press('button:has-text("Log evidence")');
await expectFlash(/does not match/, "fake pdf");
log("3 evidence items logged; disguised executable refused");

// 6. Fill the seven checks
await page.goto(`${caseUrl}?tab=checks`);
const sections = page.locator("section[id]");
const n = await sections.count();
for (let i = 0; i < n; i++) {
  await page.goto(`${caseUrl}?tab=checks`);
  const s = page.locator("section[id]").nth(i);
  const layer = await s.getAttribute("id");
  await s.locator('select[name="status"]').selectOption(layer === "DIGITAL_IDENTITY" ? "PARTIALLY_VERIFIED" : "VERIFIED");
  await s.locator('select[name="confidence"]').selectOption("HIGH");
  await s.locator('textarea[name="finding"]').fill(`Test finding for ${layer}, as of today.`);
  await s.locator('input[name="evidenceIds"]').first().check();
  if (layer === "REPRESENTATIVE_AUTHORITY") await s.locator('input[name="evidenceIds"]').nth(2).check();
  await press(s.locator("button[type=submit]"));
  await expectFlash(/saved/, `finding ${layer}`);
}
log(`${n} layers assessed and cited`);

// 7. Outcome: a better-than-evidence outcome is not selectable
await page.goto(`${caseUrl}?tab=outcome`);
if (!(await page.locator('input[value="VERIFIED_WITHIN_SCOPE"]').isDisabled())) fail("Verified within scope should be disabled");
await page.check('input[value="VERIFIED_WITH_ISSUES"]');
await page.fill('textarea[name="outcomeSummary"]', "Mfano Packaging Supplies Ltd is the registered entity on the invoice and is tax compliant as of today. Digital channels only partly verified.");
await page.fill('textarea[name="nextSteps"]', "Confirm the sender domain registrant before the second payment.");
await press('button:has-text("Save outcome")');
await expectFlash(/Outcome saved/, "outcome");
log("Outcome limited to 'Verified with issues' by the evidence");

// 8. Time and bank details
await page.goto(`${caseUrl}?tab=time`);
await page.fill('input[name="hours"]', "2.5");
await press('button:has-text("Add")');
await page.goto(`${caseUrl}?tab=bank`);
await page.click('a:has-text("Log bank details")');
await page.waitForURL(/\/payments\/new/);
await page.fill("#beneficiaryName", "Mfano Packaging Supplies Ltd");
await page.fill("#bankName", "Test Bank Kenya");
await page.fill("#account", "0123 4567 8901");
await page.fill("#sourceDescription", "Email from supplier accounts, changing the account used last month");
await page.check('input[name="isChange"]');
await page.click('button:has-text("Log instruction")');
await page.waitForURL(/\/payments\/[0-9a-f-]+$/);
const payUrl = page.url();
if (!(await page.content()).includes("Frozen")) fail("Changed instruction should start frozen");
await page.fill("#confirmationChannel", "Phone call");
await page.fill("#channelEstablishedHow", "Number in the change email");
await page.fill("#confirmedWithName", "J. Otieno");
await press('button:has-text("Record confirmation")');
await expectFlash(/independent/, "non-independent channel");
await page.fill("#confirmationChannel", "Phone call");
await page.fill("#channelEstablishedHow", "Director's number from the CR12");
await page.fill("#confirmedWithName", "A. Director");
await page.check('input[name="channelIndependent"]');
await press('button:has-text("Record confirmation")');
await expectFlash(/Confirmation recorded/, "confirmation");
if (!(await page.content()).includes("cannot approve it")) fail("Creator should not be able to approve");
await shot("05-bank-change-frozen");
log("Bank change frozen; non-independent confirmation refused; logger cannot approve");

// 9. Bank details must be confirmed before the beneficiary layer counts as verified
await page.goto(caseUrl);
await submitIn(page.locator("form", { has: page.locator('input[value="AWAITING_HUMAN_QC"]') }), "Send for review");
await expectFlash(/no bank details on this case are confirmed/, "beneficiary guard");
log("Cannot send for review while bank details are unconfirmed");

// 10. Two independent approvals confirm the bank details
await login("reviewer");
await page.goto(payUrl);
await press('button:has-text("Approve")');
await expectFlash(/Approval recorded/, "first approval");
await login("admin");
await page.goto(payUrl);
await press('button:has-text("Approve")');
await expectFlash(/Confirmed within scope/, "second approval");
log("Bank change confirmed after two independent approvals");

// 11. Send for review
await login("analyst");
await page.goto(caseUrl);
await submitIn(page.locator("form", { has: page.locator('input[value="AWAITING_HUMAN_QC"]') }), "Send for review");
await expectFlash(/Status updated/, "send for review");
await page.goto(`${caseUrl}?tab=review`);
if (!(await page.content()).includes("Only a reviewer or admin")) fail("Analyst should not be able to review");
await page.goto(caseUrl);
await shot("01-case-overview");
log("Sent for review; analyst cannot review own case");

// 12. Reviewer passes and releases
await login("reviewer");
await page.goto(`${caseUrl}/report`);
await shot("02-report-preview");
await page.goto(`${caseUrl}?tab=review`);
for (const box of await page.locator('input[name^="qc_"]').all()) await box.check();
await press('button:has-text("Pass review")');
await expectFlash(/Review passed/, "review");
await submitIn(page.locator("form", { has: page.locator('input[name="caseId"]') }).filter({ hasText: "Release report" }), "Release report");
await expectFlash(/Report released/, "release");
log("Reviewer passed and released the report");

await page.goto(`${caseUrl}/report`);
const reportHtml = await page.content();
if (!/Report fingerprint \(SHA-256\)/.test(reportHtml) || reportHtml.includes("DRAFT PREVIEW")) fail("Released report should be fingerprinted and not a draft");
await shot("03-report-released");
log("Released report is frozen with a SHA-256 fingerprint");

// 12b. Released case cannot be edited
await page.goto(`${caseUrl}?tab=issues`);
await page.fill("#description", "Edit after release");
await press('button:has-text("Log issue")');
await expectFlash(/released or closed/, "edit after release");
log("Edits to a released case are refused");

// 13. Files need a session
const docLink = await (async () => {
  await page.goto(`${caseUrl}?tab=documents`);
  return page.locator('a[href^="/api/files/"]').first().getAttribute("href");
})();
const anon = await fetch(`${BASE}${docLink}`);
if (anon.status !== 401) fail(`Anonymous download should be 401, got ${anon.status}`);
log("Document download requires sign-in");

await page.goto(`${BASE}/`);
await shot("04-dashboard");
await page.goto(`${caseUrl}?tab=history`);
await shot("06-history");

writeFileSync(`${SHOTS}/result.txt`, `passed ${step} steps\n`);
// Shared with e2e/controls.mjs, which continues with the same accounts.
writeFileSync(`${SHOTS}/mfa-secrets.json`, JSON.stringify(secrets));
console.log(`\nAll ${step} end-to-end checks passed.`);
await browser.close();
