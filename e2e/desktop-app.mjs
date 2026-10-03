// Launches the real desktop app (Electron) and drives its window through first run.
// Usage: xvfb-run node e2e/desktop-app.mjs   (Linux CI)
import { _electron as electron } from "playwright";
import { authenticator } from "otplib";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SHOTS = process.env.SHOTS_DIR ?? "./e2e/screens";
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
}
await app.close();
console.log(`✓ App closed cleanly (data in ${userData})`);
