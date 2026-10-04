// Runs the downloaded, installed v0.3.0 binary; never opens a real user's data.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { _electron as electron } from "playwright";
import { authenticator } from "otplib";

assert(process.env.DESKTOP_EXE, "Set DESKTOP_EXE to the installed published executable");
const exe = path.resolve(process.env.DESKTOP_EXE);
const userData = mkdtempSync(path.join(os.tmpdir(), "kct-published-v030-"));
const shots = process.env.SHOTS_DIR ?? "./e2e/screens";
mkdirSync(shots, { recursive: true });
const checks = [];
const observations = [];
const passed = message => { checks.push(message); console.log(`✓ ${message}`); };
const day = offset => new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
let app, win, secret;

async function launch() {
  app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userData}`, "--no-sandbox"], cwd: path.dirname(exe) });
  win = await app.firstWindow();
  win.setDefaultTimeout(30_000);
  // Keep this acceptance run on the pinned binary if a newer release appears.
  // The native menu still queries the real GitHub feed; no update is installed.
  await app.evaluate(({ app }) => {
    const load = process.getBuiltinModule("module").createRequire(`${app.getAppPath()}/main.js`);
    load("electron-updater").autoUpdater.autoDownload = false;
  });
  await win.waitForURL(url => url.protocol === "http:" && url.hostname === "127.0.0.1" && ["/setup", "/login", "/"].includes(url.pathname), { timeout: 90_000 });
}

async function press(locator) {
  const posted = win.waitForResponse(r => r.request().method() === "POST");
  await locator.click();
  await posted;
  await win.waitForLoadState("networkidle");
}

try {
  await launch();
  const menu = await app.evaluate(({ app, Menu, BrowserWindow }) => {
    const help = Menu.getApplicationMenu()?.items.find(item => item.label === "Help");
    const check = help?.submenu?.items.find(item => item.label === "Check for updates…");
    return { version: app.getVersion(), data: app.getPath("userData"), visible: BrowserWindow.getAllWindows()[0].isMenuBarVisible(), check: !!check && check.enabled && check.visible };
  });
  assert.equal(menu.version, "0.3.0");
  assert.equal(path.resolve(menu.data), path.resolve(userData));
  assert(menu.visible && menu.check, "The installed Help → Check for updates control is missing or hidden");
  passed("Published installer runs as 0.3.0 with a visible, enabled Help update control");

  await app.evaluate(({ dialog, Menu }) => {
    globalThis.__publishedDialogs = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.__publishedDialogs.push({ message: options.message, detail: options.detail });
      return { response: 1, checkboxChecked: false };
    };
    dialog.showErrorBox = (_title, detail) => { globalThis.__publishedError = detail; };
    Menu.getApplicationMenu().items.find(item => item.label === "Help").submenu.items.find(item => item.label === "Check for updates…").click();
  });
  const updateDeadline = Date.now() + 60_000;
  while (true) {
    const messages = await app.evaluate(() => ({ dialogs: globalThis.__publishedDialogs, error: globalThis.__publishedError }));
    assert(!messages.error, messages.error);
    if (messages.dialogs.some(d => d.message === "You have the latest version (0.3.0)." || /^Version \d+\.\d+\.\d+ is downloading$/.test(d.message))) break;
    const failure = messages.dialogs.find(d => d.message === "Couldn't check for updates");
    assert(!failure, "The published app could not reach its update feed");
    assert(Date.now() < updateDeadline, "Live update check did not finish within 60 seconds");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  passed("The real Help update action reaches GitHub and reports release availability");

  assert.equal(new URL(win.url()).pathname, "/setup");
  await win.fill("#name", "Published Release Tester");
  await win.fill("#email", "published-tester@example.test");
  await win.fill("#password", "published-test-password-123");
  await win.fill("#confirm", "published-test-password-123");
  await press(win.locator("button[type=submit]"));
  await win.waitForURL(/\/security/);
  secret = (await win.locator("code").first().textContent()).trim();
  await win.fill('input[name="code"]', authenticator.generate(secret));
  await press(win.getByRole("button", { name: "Turn on two-factor login" }));
  await win.getByText("Two-factor login is on.", { exact: true }).waitFor();
  const base = new URL(win.url()).origin;
  passed("Fresh installed first run creates an administrator and enables MFA");

  await win.goto(`${base}/cases/new`);
  await win.fill("#clientName", "Published test client (fictional)");
  await win.fill("#legalName", "Published test supplier (fictional)");
  await win.fill("#kraPin", "P999999999X");
  await win.fill("#decisionPurpose", "Published release acceptance using fictional data");
  await win.fill("#expectedPaymentDate", day(-1));
  await press(win.getByRole("button", { name: "Open case", exact: true }));
  await win.waitForURL(/\/cases\/[0-9a-f-]+\?tab=intake/);
  const casePath = new URL(win.url()).pathname;

  await win.goto(`${base}${casePath}?tab=evidence`);
  await win.fill("#sourceName", "Expired fictional capture");
  await win.fill("#summary", "A fictional source whose expiry is yesterday");
  await win.fill("#validUntil", day(-1));
  await win.fill("#validityNote", "Date printed on the fictional source");
  await press(win.getByRole("button", { name: "Log evidence", exact: true }));
  await win.goto(`${base}${casePath}?tab=checks`);
  const finding = win.locator("#LEGAL_IDENTITY form");
  await finding.locator('select[name="status"]').selectOption("VERIFIED");
  await finding.locator('textarea[name="finding"]').fill("A recorded positive finding for the expired-source regression");
  await finding.locator('input[name="evidenceIds"]').first().check();
  await press(finding.getByRole("button", { name: /Save/ }));
  await win.goto(`${base}${casePath}?tab=assistant`);
  await win.getByText("E01: expired", { exact: true }).waitFor();
  await win.getByText("Refresh support for legal identity", { exact: true }).waitFor();
  assert((await win.locator("#handover-draft").inputValue()).includes("[E01]"));
  await win.screenshot({ path: `${shots}/published-smart-assistant.png`, fullPage: true });
  passed("Installed smart assistant flags expired positive support and preserves evidence citations");

  await win.goto(`${base}${casePath}?tab=outcome`);
  assert(await win.locator('input[value="VERIFIED_WITHIN_SCOPE"]').isDisabled());
  passed("Installed outcome screen refuses an unsupported positive outcome");
  await win.goto(`${base}${casePath}?tab=evidence`);
  const row = win.locator("tr", { has: win.getByText("E01", { exact: true }) });
  await row.locator("summary").click();
  await row.locator('input[name="validUntil"]').fill(day(2));
  await row.locator('input[name="validityNote"]').fill("Corrected transcription of the fictional source expiry");
  await press(row.getByRole("button", { name: "Save validity", exact: true }));
  await win.goto(`${base}${casePath}?tab=assistant`);
  assert.equal(await win.getByText("E01: expired", { exact: true }).count(), 0);
  assert.equal(await win.getByText("Refresh support for legal identity", { exact: true }).count(), 0);
  passed("Recording a corrected validity policy clears the corresponding smart alerts");

  // Probe source quality separately from date validity; record a gap rather than
  // treating a source's dates as proof that it can support an identity claim.
  await win.goto(`${base}${casePath}?tab=evidence`);
  await win.fill("#sourceName", "Fictional unverified record");
  await win.selectOption("#category", "UNVERIFIED");
  await win.fill("#summary", "Fictional uncorroborated information for the source-quality probe");
  await win.fill("#validUntil", day(2));
  await win.fill("#validityNote", "Fictional date policy for the source-quality probe");
  await press(win.getByRole("button", { name: "Log evidence", exact: true }));
  await win.goto(`${base}${casePath}?tab=checks`);
  const identity = win.locator("#LEGAL_IDENTITY form");
  for (const box of await identity.locator('input[name="evidenceIds"]').all()) await box.uncheck();
  await identity.locator("label", { hasText: "E02" }).locator('input[name="evidenceIds"]').check();
  await press(identity.getByRole("button", { name: /Save/ }));
  await win.goto(`${base}${casePath}?tab=assistant`);
  if (await win.getByText("Refresh support for legal identity", { exact: true }).count() === 0) {
    observations.push({ code: "SOURCE_TYPE_NOT_ENFORCED", detail: "v0.3.0 counts an examined source tagged Unverified with current dates as positive legal-identity support. Source quality still depends on human review; enforce per-check source requirements before production." });
    console.log("Observed gap: a source tagged Unverified clears the legal-identity support warning in v0.3.0.");
  }
  await win.goto(`${base}${casePath}?tab=checks`);
  const correctedIdentity = win.locator("#LEGAL_IDENTITY form");
  for (const box of await correctedIdentity.locator('input[name="evidenceIds"]').all()) await box.uncheck();
  await correctedIdentity.locator("label", { hasText: "E01" }).locator('input[name="evidenceIds"]').check();
  await press(correctedIdentity.getByRole("button", { name: /Save/ }));
  passed("Source-quality probe completed; any observed gap is retained in the result");

  await win.goto(`${base}/cases/new`);
  await win.fill("#kraPin", "P999999999X");
  await win.getByText("Possible existing supplier", { exact: true }).waitFor();
  await win.getByRole("button", { name: /^Use Published test supplier/ }).click();
  assert.notEqual(await win.locator("#counterpartyId").inputValue(), "new");
  passed("Installed intake suggests the matching supplier and allows explicit reuse");
  await win.goto(`${base}/`);
  await win.getByRole("heading", { name: "Automatic attention queue" }).waitFor();
  await win.getByText(/Payment date approaching or reached/).waitFor();
  await win.screenshot({ path: `${shots}/published-dashboard.png`, fullPage: true });
  passed("Installed dashboard automatically highlights the fictional payment deadline");

  const backup = path.join(userData, "published-test.kctbackup");
  const passwordWindow = app.waitForEvent("window");
  await app.evaluate(({ dialog, Menu }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    const original = dialog.showMessageBox;
    dialog.showMessageBox = async (...args) => {
      if (args[1]?.message === "Backup saved") globalThis.__publishedBackupSaved = true;
      return original(...args);
    };
    Menu.getApplicationMenu().items.find(item => item.label === "File").submenu.items.find(item => item.label === "Back up data…").click();
  }, backup);
  const prompt = await passwordWindow;
  await prompt.fill("#password", "published-backup-password-123");
  await prompt.fill("#confirm", "published-backup-password-123");
  await prompt.click("button[type=submit]");
  const backupDeadline = Date.now() + 90_000;
  while (true) {
    const state = await app.evaluate(() => ({ saved: globalThis.__publishedBackupSaved, error: globalThis.__publishedError }));
    assert(!state.error, state.error);
    if (state.saved) break;
    assert(Date.now() < backupDeadline, "Installed encrypted backup did not complete");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(existsSync(backup));
  await win.getByRole("heading", { name: "Automatic attention queue" }).waitFor();
  passed("Published executable creates an encrypted backup and restarts its database");

  await app.close(); app = null;
  await launch();
  if (new URL(win.url()).pathname === "/") {
    await press(win.getByRole("button", { name: "Sign out", exact: true }));
    await win.waitForURL(/\/login$/);
  }
  assert.equal(new URL(win.url()).pathname, "/login");
  await win.fill("#email", "published-tester@example.test");
  await win.fill("#password", "published-test-password-123");
  await press(win.locator("button[type=submit]"));
  await win.waitForURL(/\/login\/mfa/);
  await win.fill("#code", authenticator.generate(secret));
  await press(win.locator("button[type=submit]"));
  await win.waitForURL(url => url.pathname === "/");
  const reopenedBase = new URL(win.url()).origin;
  await win.goto(`${reopenedBase}${casePath}?tab=evidence`);
  await win.locator("tr", { has: win.getByText("E01", { exact: true }) }).getByText("Current under recorded policy", { exact: true }).waitFor();
  await win.getByText("Corrected transcription of the fictional source expiry", { exact: true }).waitFor();
  passed("MFA login, case records and corrected source validity survive closing and reopening");
  await app.close(); app = null;
  passed("Installed app closes cleanly after the acceptance checks");
  writeFileSync(`${shots}/published-result.json`, JSON.stringify({ version: "0.3.0", installerSha256: "0177a3ae65c3b07538dffca8fbf3904813b4f4e48dcc2cb87f1a6b4c35cb2738", passed: checks, observations }, null, 2));
} finally {
  if (app) await app.close();
}
