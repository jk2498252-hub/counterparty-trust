// Restore an encrypted desktop backup into a NEW directory, while the app is
// closed. Usage: node scripts/restore-backup.mjs backup.kctbackup new-folder
import { createRequire } from "node:module";
import path from "node:path";
import { askPassword } from "./password-prompt.mjs";
const { restoreBackup } = createRequire(import.meta.url)("../desktop/backup.js");

const [source, destination] = process.argv.slice(2);
if (!source || !destination) {
  console.error("Usage: node scripts/restore-backup.mjs backup.kctbackup new-folder");
  process.exit(1);
}
const password = await askPassword("Backup password: ");
try {
  await restoreBackup(path.resolve(source), path.resolve(destination), password);
  console.log(`Restored to ${path.resolve(destination)}. Existing live data was not changed.`);
} catch (error) {
  console.error(`Restore failed: ${error.message}`);
  process.exitCode = 1;
}
