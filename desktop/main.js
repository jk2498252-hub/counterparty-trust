// Desktop launcher: starts the workbench on this computer and shows it in a window.
// Data (database, uploaded documents, keys) lives in the user's app-data folder.
const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { fork } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const APP_NAME = "Counterparty Trust";
let serverProcess = null;
let mainWindow = null;
let port = 0;
let quitting = false;

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
  return new Promise((resolve) => {
    const proc = serverProcess;
    if (!proc || proc.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      proc.kill();
      resolve();
    }, 8000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      proc.send("shutdown"); // lets the database close cleanly
    } catch {
      proc.kill();
    }
  });
}

async function backupData() {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Choose where to save the backup",
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || !filePaths[0]) return;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const target = path.join(filePaths[0], `Counterparty Trust backup ${stamp}`);
  quitting = true; // the server restart below is intentional
  await stopServer();
  try {
    fs.cpSync(dataRoot(), target, { recursive: true, filter: (src) => !src.endsWith(".lock") });
    await startServer();
    quitting = false;
    mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    dialog.showMessageBox(mainWindow, {
      type: "info",
      message: "Backup saved",
      detail: `${target}\n\nThe backup includes your encryption keys. Keep it somewhere safe and private.`,
    });
  } catch (e) {
    quitting = false;
    dialog.showErrorBox(APP_NAME, `Backup failed: ${e.message}`);
    if (!serverProcess || serverProcess.exitCode !== null) {
      await startServer();
      mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    }
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
  autoUpdater.autoInstallOnAppQuit = true;
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
  quitting = true;
  await stopServer(); // close the database cleanly before the installer runs
  serverProcess = null;
  autoUpdater.quitAndInstall(false, true);
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
    quitting = true;
    await stopServer();
    serverProcess = null;
    app.quit();
  }
});

app.on("window-all-closed", () => app.quit());
