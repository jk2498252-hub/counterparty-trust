// Launches the real desktop app (Electron) and drives its window through first run.
// Usage: xvfb-run node e2e/desktop-app.mjs   (Linux CI)
import { _electron as electron } from "playwright";
import { authenticator } from "otplib";
import { mkdtempSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SHOTS = process.env.SHOTS_DIR ?? "./e2e/screens";
mkdirSync(SHOTS, { recursive: true });
const userData = process.env.DESKTOP_USER_DATA ?? mkdtempSync(path.join(os.tmpdir(), "kct-desktop-"));
// DESKTOP_EXE = a packaged build (e.g. desktop/dist/linux-unpacked/counterparty-trust-desktop); otherwise run from source.
const packaged = process.env.DESKTOP_EXE;
const app = await electron.launch({
  executablePath: packaged ? path.resolve(packaged) : path.resolve("desktop/node_modules/electron/dist/electron"),
  args: [...(packaged ? [] : [path.resolve("desktop")]), `--user-data-dir=${userData}`, "--no-sandbox"],
  cwd: path.resolve("desktop"),
});
const win = await app.firstWindow();
await win.screenshot({ path: `${SHOTS}/d0-loading.png` });
await win.waitForURL(/\/(setup|login)/, { timeout: 90000 });
console.log(`✓ Desktop app started; window shows ${new URL(win.url()).pathname}`);

if (win.url().endsWith("/setup")) {
  await win.screenshot({ path: `${SHOTS}/d1-setup.png` });
  await win.fill("#name", "Rick Founder");
  await win.fill("#email", "rick@example.test");
  await win.fill("#password", "first-admin-password");
  await win.fill("#confirm", "first-admin-password");
  await win.click("button[type=submit]");
  await win.waitForURL(/\/security/);
  const secret = (await win.locator("code").first().textContent()).trim();
  await win.fill('input[name="code"]', authenticator.generate(secret));
  await win.click('button:has-text("Turn on two-factor login")');
  await win.waitForSelector("text=Two-factor login is on");
  console.log("✓ First admin created in the desktop window, two-factor on");
  await win.goto(win.url().replace(/\/security.*/, "/"));
  await win.waitForSelector("text=Pilot economics");
  await win.screenshot({ path: `${SHOTS}/d2-dashboard.png` });
  console.log("✓ Dashboard loads inside the desktop window");

  // Exercise the packaged backup dialog, preload/IPC and real DB shutdown.
  const backup = path.join(userData, "smoke-backup.kctbackup");
  const passwordWindow = app.waitForEvent("window");
  await app.evaluate(({ dialog, Menu }, destination) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    dialog.showMessageBox = async (_window, options) => {
      if (options.message === "Backup saved") globalThis.__smokeBackupSaved = true;
      return { response: 1, checkboxChecked: false };
    };
    dialog.showErrorBox = (_title, detail) => { globalThis.__smokeBackupError = detail; };
    Menu.getApplicationMenu().items.find(item => item.label === "File").submenu.items.find(item => item.label === "Back up data…").click();
  }, backup);
  const prompt = await passwordWindow;
  await prompt.fill("#password", "smoke-test-backup-password");
  await prompt.fill("#confirm", "smoke-test-backup-password");
  await prompt.click("button[type=submit]");
  const deadline = Date.now() + 90_000;
  while (true) {
    const state = await app.evaluate(() => ({ saved: globalThis.__smokeBackupSaved, error: globalThis.__smokeBackupError }));
    if (state.error) throw new Error(`Packaged backup failed: ${state.error}`);
    if (state.saved) break;
    if (Date.now() > deadline) throw new Error("Packaged backup did not complete");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!existsSync(backup)) throw new Error("Packaged backup file missing");
  await win.waitForSelector("text=Pilot economics");
  console.log("✓ Packaged encrypted backup completed and the database restarted");
}
await app.close();
console.log(`✓ App closed cleanly (data in ${userData})`);
