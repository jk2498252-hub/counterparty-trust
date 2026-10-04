// Desktop launcher: starts the workbench on this computer and shows it in a window.
// Data (database, uploaded documents, keys) lives in the user's app-data folder.
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");
const { fork } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { stopServerProcess } = require("./lifecycle");
const { createBackup } = require("./backup");

const APP_NAME = "Counterparty Trust";
let serverProcess = null;
let mainWindow = null;
let port = 0;
let quitting = false;
let shutdownInProgress = false;
const requestedUserData = app.commandLine.getSwitchValue("user-data-dir");
if (requestedUserData) app.setPath("userData", path.resolve(requestedUserData));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const dataRoot = () => path.join(app.getPath("userData"), "data");
const serverDir = () => (app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(__dirname, "server"));
const logFile = () => path.join(app.getPath("userData"), "server.log");

/** Secrets are created once on first run and kept in the data folder. */
function loadConfig() {
  const file = path.join(dataRoot(), "config.json");
  fs.mkdirSync(dataRoot(), { recursive: true });
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const config = {
    sessionSecret: crypto.randomBytes(48).toString("base64"),
    dataEncryptionKey: crypto.randomBytes(32).toString("base64"),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2), { mode: 0o600 });
  return config;
}

function freePort(preferred) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => {
      const any = net.createServer();
      any.listen(0, "127.0.0.1", () => {
        const p = any.address().port;
        any.close(() => resolve(p));
      });
    });
    srv.listen(preferred, "127.0.0.1", () => srv.close(() => resolve(preferred)));
  });
}

function waitForServer(url, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error("The workbench did not start in time."));
          else setTimeout(attempt, 300);
        });
    };
    attempt();
  });
}

async function startServer() {
  const config = loadConfig();
  port = await freePort(47321);
  const log = fs.createWriteStream(logFile(), { flags: "a" });
  log.write(`\n--- start ${new Date().toISOString()} on port ${port} ---\n`);
  serverProcess = fork(path.join(serverDir(), "start.mjs"), [], {
    cwd: serverDir(),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      ALLOW_FIRST_RUN_SETUP: "true",
      PGLITE_DIR: path.join(dataRoot(), "database"),
      UPLOAD_DIR: path.join(dataRoot(), "documents"),
      SESSION_SECRET: config.sessionSecret,
      DATA_ENCRYPTION_KEY: config.dataEncryptionKey,
      COOKIE_SECURE: "false",
      APP_VERSION: app.getVersion(),
      REQUIRE_MFA: "true",
      DATABASE_URL: "",
    },
  });
  serverProcess.stdout.pipe(log);
  serverProcess.stderr.pipe(log);
  const proc = serverProcess;
  proc.on("exit", (code) => {
    log.write(`--- server exited with code ${code} ---\n`);
    if (!quitting && proc === serverProcess) {
      dialog.showErrorBox(
        APP_NAME,
        code === 3
          ? "The workbench data is already open in another window. Close it and try again."
          : `The workbench stopped unexpectedly (code ${code}). Details are in:\n${logFile()}`,
      );
      app.quit();
    }
  });
  await waitForServer(`http://127.0.0.1:${port}/login`, 90_000);
}

function stopServer() {
  return stopServerProcess(serverProcess);
}

function backupPassword() {
  return new Promise(resolve => {
    const window = new BrowserWindow({
      width: 470, height: 450, parent: mainWindow, modal: true, resizable: false,
      title: "Encrypt backup", webPreferences: { preload: path.join(__dirname, "backup-preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", event => event.preventDefault());
    let submitted = false;
    ipcMain.handle("backup-password", (event, password) => {
      if (event.sender !== window.webContents || typeof password !== "string" || password.length < 12 || password.length > 1024) return false;
      submitted = true;
      resolve(password);
      setImmediate(() => window.close());
      return true;
    });
    window.on("closed", () => {
      ipcMain.removeHandler("backup-password");
      if (!submitted) resolve(null);
    });
    window.loadFile(path.join(__dirname, "backup-password.html"));
  });
}

async function backupData() {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  try {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: "Save an encrypted backup", defaultPath: `Counterparty-Trust-${stamp}.kctbackup`,
      filters: [{ name: "Encrypted Counterparty Trust backup", extensions: ["kctbackup"] }],
    });
    if (canceled || !filePath) return;
    const password = await backupPassword();
    if (!password) return;
    quitting = true;
    await stopServer();
    serverProcess = null;
    await createBackup(dataRoot(), filePath, password);
    await startServer();
    quitting = false;
    mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "Backup saved",
      detail: `${filePath}\n\nKeep your backup password separately. It is required to restore your files and encryption keys.`,
    });
  } catch (e) {
    quitting = false;
    dialog.showErrorBox(APP_NAME, `Backup failed: ${e.message}`);
    if (!serverProcess || serverProcess.exitCode !== null) {
      await startServer();
      mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    }
  } finally {
    shutdownInProgress = false;
    if (mainWindow?.isDestroyed()) app.quit();
  }
}

// ---------- Updates ----------
// New versions are published as GitHub releases. The app checks on start and every
// 6 hours, downloads quietly, then offers "Restart to update".
let updateReady = null;
let manualCheck = false;

function setupUpdates() {
  if (!app.isPackaged) return; // only installed copies update themselves
  autoUpdater.autoDownload = true;
  // Installation is explicitly initiated after the server has actually exited.
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on("update-downloaded", async (info) => {
    updateReady = info.version;
    buildMenu();
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["Restart to update", "Later"],
      defaultId: 0,
      cancelId: 1,
      message: `Version ${info.version} is ready to install`,
      detail: "Your data stays as it is. If you choose Later, it installs the next time you close the app.",
    });
    if (response === 0) installUpdateNow();
  });
  autoUpdater.on("update-not-available", () => {
    if (manualCheck) dialog.showMessageBox(mainWindow, { type: "info", message: `You have the latest version (${app.getVersion()}).` });
    manualCheck = false;
  });
  autoUpdater.on("error", (e) => {
    fs.appendFileSync(logFile(), `[updater] ${e?.message ?? e}\n`);
    if (manualCheck) dialog.showMessageBox(mainWindow, { type: "warning", message: "Couldn't check for updates", detail: "Check your internet connection and try again later." });
    manualCheck = false;
  });
  autoUpdater.on("update-available", (info) => {
    if (manualCheck) dialog.showMessageBox(mainWindow, { type: "info", message: `Version ${info.version} is downloading`, detail: "You'll be asked to restart when it's ready." });
    manualCheck = false;
  });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15_000);
  setInterval(check, 6 * 60 * 60 * 1000);
}

async function installUpdateNow() {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  quitting = true;
  try {
    await stopServer();
    serverProcess = null;
    autoUpdater.quitAndInstall(false, true);
  } catch (error) {
    quitting = false;
    dialog.showErrorBox(APP_NAME, `Update postponed: ${error.message}`);
  } finally {
    shutdownInProgress = false;
  }
}

function checkForUpdatesNow() {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, { type: "info", message: "Updates only work in the installed app." });
    return;
  }
  if (updateReady) return installUpdateNow();
  manualCheck = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Back up data…", click: backupData },
        { label: "Open data folder", click: () => shell.openPath(dataRoot()) },
        { type: "separator" },
        { label: "Print / save report as PDF", accelerator: "CmdOrCtrl+P", click: () => mainWindow?.webContents.print() },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: "Alt+Left", click: () => mainWindow?.webContents.navigationHistory.goBack() },
        { role: "reload" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        updateReady
          ? { label: `Restart to install version ${updateReady}`, click: installUpdateNow }
          : { label: "Check for updates…", click: checkForUpdatesNow },
        { type: "separator" },
        { label: "Open server log", click: () => shell.openPath(logFile()) },
        {
          label: `About ${APP_NAME}`,
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: "info",
              message: `${APP_NAME} ${app.getVersion()}`,
              detail: `Pre-transaction supplier verification workbench (Kenya).\n\nData folder:\n${dataRoot()}`,
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME,
    icon: path.join(__dirname, "assets", "icon.png"),
    show: false,
    backgroundColor: "#f6f8f7",
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, "loading.html"));

  // Only the local workbench opens inside the window; outside links open in the normal browser.
  const isLocal = (url) => url.startsWith(`http://127.0.0.1:${port}/`) || url.startsWith("file://");
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isLocal(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
  // Downloads (documents) go to the Downloads folder and open the folder afterwards.
  mainWindow.webContents.session.on("will-download", (_e, item) => {
    item.once("done", (_ev, state) => state === "completed" && shell.showItemInFolder(item.getSavePath()));
  });

  try {
    await startServer();
    mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  } catch (e) {
    dialog.showErrorBox(APP_NAME, `${e.message}\n\nDetails are in:\n${logFile()}`);
    app.quit();
  }
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  setupUpdates();
});

app.on("before-quit", async (event) => {
  if (serverProcess && serverProcess.exitCode === null) {
    event.preventDefault();
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    quitting = true;
    try {
      await stopServer();
      serverProcess = null;
      if (updateReady) autoUpdater.quitAndInstall(false, true);
      else app.quit();
    } catch (error) {
      quitting = false;
      dialog.showErrorBox(APP_NAME, `Couldn't close the workbench: ${error.message}`);
    } finally {
      shutdownInProgress = false;
    }
  }
});

app.on("window-all-closed", () => app.quit());
