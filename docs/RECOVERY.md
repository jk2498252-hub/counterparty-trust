# Backup, restore and administrator recovery

## Desktop backup

Use **File → Back up data…**, choose a `.kctbackup` destination outside the live data folder, and enter a separate password of at least 12 characters. Store the password in a password manager. Losing it makes the backup unusable.

The app closes its database before creating the archive, then restarts. The backup includes the database, uploaded files and `config.json`, all inside password-authenticated encryption. Empty PostgreSQL directories are preserved. Failed or incomplete backups are removed. A timeout or unsuccessful database close cancels backup/update rather than treating a killed process as safely closed.

Earlier releases created unencrypted backup folders. This release does not encrypt existing exported folders; protect those copies separately. The live data folder and key file still depend on computer, account and disk protection.

## Restore to a new directory

Close the app. With this repository available and Node 22+, run:

```text
node scripts/restore-backup.mjs path-to-backup.kctbackup path-to-new-restore-folder
```

The command prompts for the backup password without echoing it. It refuses an existing destination, authenticates the archive, and removes incomplete restores on failure. It never replaces live data automatically.

Inspect the restored folder. Keep the original app-data folder as a rollback copy, then place the restored folder at the app's `data` location while the app remains closed. The normal Windows location is `%APPDATA%\Counterparty Trust\data`; **File → Open data folder** identifies the location of the actual installation. Start the app and check cases, source captures, bank details and authenticator sign-in before retiring the rollback copy.

Tests restore an actual older PGlite database after migration, preserve case/document/payment and MFA records, and decrypt a bank account using the restored key. Wrong passwords and tampered archives fail. This is a local recovery test; a clean-machine operational drill remains required for the deployed service.

## Lost sole-admin authenticator

Recovery requires control of the server or desktop data directory. Verify the administrator's identity and authority using the operating procedure before using it. There is no anonymous web recovery endpoint.

For a server, load the deployment's database environment and run:

```text
npm run user:recover -- --email administrator@example.com
```

For a desktop, close the app first and set `PGLITE_DIR` to its `data/database` folder, with no `DATABASE_URL`, then run the same command from a repository checkout after `npm ci`. Keep a backup first. A live desktop process lock blocks recovery.

The command prompts for a new temporary password without echoing it. It updates an existing ADMIN account, revokes sessions, clears its MFA factor/lockouts, requires a password change, and records `auth.admin_recovered` in the audit log in the same transaction. Sign in, change that password and enrol a new authenticator. Recovery does not create another administrator or bypass the normal workflow for case release.

## Server backups

The desktop archive is not a PostgreSQL server backup service. Configure scheduled database backups plus uploaded captures and securely held encryption keys for the actual deployment. Restore them together into an isolated environment, verify report/file integrity and sign-in, and record recovery time and data-loss limits. Never assume a persistent volume is a tested backup.
