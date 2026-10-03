# Desktop app (Windows)

The desktop app is the same workbench packaged as a normal Windows program:
double-click **Counterparty Trust**, a window opens, and everything runs on that computer.

- **No server or database to install.** A built-in PostgreSQL (PGlite) stores data in
  `%APPDATA%\Counterparty Trust\data` (database, uploaded documents, and `config.json` with the encryption keys).
- **First run** shows a setup screen to create the admin account; add analysts and reviewers under Team.
- **Back up** from the menu: File → Back up data… The backup includes the encryption keys, so keep it private.
- **Updates.** The installed app checks GitHub releases on start and every 6 hours, downloads new versions quietly,
  and offers **Restart to update** (also under Help → Check for updates…). Updates are read from the public
  releases of `jk2498252-hub/counterparty-trust`; if that repository is made private, publish releases to a public
  repository instead and change `build.publish` in `desktop/package.json`.
- **One computer.** The app only listens on `127.0.0.1`. For a team on several computers, use the server version (see the main README).

## Building the installer

```bash
npm ci                       # in the repo root
cd desktop && npm ci
npm run dist:win             # → desktop/dist/Counterparty-Trust-Setup-<version>.exe (+ latest.yml for updates)
```

Building on Linux needs Wine (`wine64` and `wine32:i386`). On Windows, or in GitHub Actions (`.github/workflows/desktop.yml`), no extra tools are needed.

`build.mjs` builds Next.js in standalone mode and assembles `desktop/server/` (server code, migrations, runtime packages).
`main.js` is the Electron launcher: it creates the secrets on first run, starts the server as a child process, waits for it,
and shows it in the window. `server-start.mjs` applies database migrations, holds a lock so two copies can't open the same data,
and closes the database cleanly on exit.

The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC" on first install
(More info → Run anyway). Buy a code-signing certificate before giving it to clients.

## Publishing an update

1. Raise `version` in `desktop/package.json` (e.g. 0.2.0 → 0.2.1) and push to `main`.
2. On GitHub: Actions → **Desktop app (Windows)** → **Run workflow**, release = `v0.2.1`.
3. Installed apps pick it up within 6 hours, or straight away via Help → Check for updates….
