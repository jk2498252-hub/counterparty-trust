# Desktop app (Windows)

The desktop app is the same workbench packaged as a normal Windows program:
double-click **Counterparty Trust**, a window opens, and everything runs on that computer.

- **No server or database to install.** A built-in PostgreSQL (PGlite) stores data in
  `%APPDATA%\Counterparty Trust\data` (database, uploaded documents, and `config.json` with the encryption keys).
- **First run** shows a setup screen to create the admin account; add analysts and reviewers under Team.
- **Back up** from the menu: File → Back up data… The backup includes the encryption keys, so keep it private.
- **One computer.** The app only listens on `127.0.0.1`. For a team on several computers, use the server version (see the main README).

## Building the installer

```bash
npm ci                       # in the repo root
cd desktop && npm ci
npm run dist:win             # → desktop/dist/Counterparty-Trust-Setup-<version>.exe
```

Building on Linux needs Wine (`wine64` and `wine32:i386`). On Windows, or in GitHub Actions (`.github/workflows/desktop.yml`), no extra tools are needed.

`build.mjs` builds Next.js in standalone mode and assembles `desktop/server/` (server code, migrations, runtime packages).
`main.js` is the Electron launcher: it creates the secrets on first run, starts the server as a child process, waits for it,
and shows it in the window. `server-start.mjs` applies database migrations, holds a lock so two copies can't open the same data,
and closes the database cleanly on exit.

The installer is not code-signed yet, so Windows SmartScreen shows "Windows protected your PC" on first install
(More info → Run anyway). Buy a code-signing certificate before giving it to clients.
