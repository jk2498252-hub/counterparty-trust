# Desktop app (Windows)

The desktop app is the same workbench packaged as a normal Windows program:
double-click **Counterparty Trust**, a window opens, and everything runs on that computer.

- **No server or database to install.** A built-in PostgreSQL (PGlite) stores data in
  `%APPDATA%\Counterparty Trust\data` (database, uploaded documents, and `config.json` with the encryption keys).
- **First run** shows a setup screen to create the admin account; add analysts and reviewers under Team.
- **Back up** from File → Back up data… Choose a separate 12+ character password. The `.kctbackup` file encrypts the database, documents and keys with AES-256-GCM. Keep the password separately. See [restore and recovery instructions](../docs/RECOVERY.md).
- **Updates.** The installed app checks GitHub releases on start and every 6 hours, downloads new versions quietly,
  and offers **Restart to update** (also under Help → Check for updates…). Updates are read from the public
  releases of `jk2498252-hub/counterparty-trust`; if that repository is made private, publish releases to a public
  repository instead and change `build.publish` in `desktop/package.json`.
- **First update:** Versions 0.1.x have no updater. Install a current release manually once. Version 0.2.0 and later can receive updates through Help → Check for updates…. An update is installed only after the database has actually closed; a failed or timed-out close postpones installation.
- **One computer.** The app only listens on `127.0.0.1`. For a team on several computers, use the server version (see the main README).
- **v0.3.0 source validity.** Existing evidence receives empty policy fields. Before reviewing/releasing an open case with positive findings, record an actual expiry or justified recheck date and its basis for supporting sources. Historical reports stay frozen. Back up before updating.

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

The installer is not code-signed yet. Signed installation and update verification remain required before client distribution.

## Publishing an update

1. Raise `version` in root and desktop `package.json` and both lockfiles, and add `docs/releases/v<version>.md`.
2. Merge the tested change into `main`. Successful main CI automatically starts **Desktop app (Windows)**.
3. The workflow tests accounts and transactions, legacy database migration, encrypted restore/recovery, and the actual packaged Windows app. It verifies that `latest.yml`, the installer and blockmap agree, then creates the GitHub release. Existing releases are never overwritten.
4. Installed apps pick it up within six hours, or through Help → Check for updates…. They download automatically and install after a clean close or an approved restart.

Manual workflow runs can build artifacts without publishing. To publish manually, the release tag must match both package versions, the commit must be current main, and main CI must have passed.
