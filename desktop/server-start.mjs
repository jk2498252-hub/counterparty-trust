// Starts the workbench server for the desktop app:
// 1. applies database migrations to the built-in database, 2. starts Next.js,
// 3. on "shutdown" from the launcher, closes the database cleanly and exits.
import path from "node:path";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.PGLITE_DIR;
if (!dir) throw new Error("PGLITE_DIR is not set");

// Only one running copy may use the data folder; two would corrupt it.
const lockFile = `${dir}.lock`;
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
mkdirSync(path.dirname(lockFile), { recursive: true });
if (existsSync(lockFile)) {
  const pid = Number(readFileSync(lockFile, "utf8"));
  if (pid && pid !== process.pid && pidAlive(pid)) {
    console.error(`[server] data folder is in use by process ${pid}`);
    process.exit(3);
  }
  rmSync(lockFile, { force: true }); // stale lock from a crash
}
writeFileSync(lockFile, String(process.pid), { flag: "wx" });
const releaseLock = () => rmSync(lockFile, { force: true });
process.on("exit", releaseLock);

const client = new PGlite(dir);
await migrate(drizzle(client), { migrationsFolder: path.join(here, "drizzle") });
await client.close();
console.log("[server] database ready");

process.chdir(here);
createRequire(import.meta.url)("./server.js");

async function shutdown() {
  globalThis.__kctClosing = true;
  try {
    await globalThis.__kctPglite?.close();
  } catch (e) {
    console.error("[server] close failed", e);
    process.exit(1);
  }
  process.exit(0);
}
process.on("message", (m) => m === "shutdown" && shutdown());
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
