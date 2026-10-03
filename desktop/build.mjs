// Builds the self-contained server that the desktop app runs.
// Usage (from the repo root): node desktop/build.mjs
import { execSync } from "node:child_process";
import { cpSync, existsSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(desktop, "..");
const out = path.join(desktop, "server");

console.log("Building Next.js (standalone)…");
execSync("npx next build", { cwd: root, stdio: "inherit", env: { ...process.env, DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" } });

const standalone = path.join(root, ".next", "standalone");
if (!existsSync(path.join(standalone, "server.js"))) throw new Error("Standalone build missing server.js");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(standalone, out, { recursive: true });
cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
cpSync(path.join(root, "drizzle"), path.join(out, "drizzle"), { recursive: true });
cpSync(path.join(desktop, "server-start.mjs"), path.join(out, "start.mjs"));

// Packages loaded at runtime must be complete (tracing can miss WASM and sub-paths).
for (const pkg of ["@electric-sql/pglite", "drizzle-orm", "pg", "pg-pool", "pg-protocol", "pg-types", "pgpass", "pg-connection-string", "pg-int8", "postgres-array", "postgres-bytea", "postgres-date", "postgres-interval", "split2", "xtend", "bcryptjs"]) {
  const src = path.join(root, "node_modules", pkg);
  if (existsSync(src)) cpSync(src, path.join(out, "node_modules", pkg), { recursive: true, dereference: true });
}
// Image optimisation is unused and its native binaries are platform-specific.
for (const pkg of ["sharp", "@img"]) rmSync(path.join(out, "node_modules", pkg), { recursive: true, force: true });
// Trim the download: source maps, type definitions and unused database extensions.
const trim = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) trim(full);
    else if (/\.(map|d\.ts|d\.cts|d\.mts)$/.test(entry.name)) rmSync(full);
  }
};
trim(path.join(out, "node_modules"));
const pgliteDist = path.join(out, "node_modules", "@electric-sql", "pglite", "dist");
for (const f of readdirSync(pgliteDist)) if (f.endsWith(".tar.gz")) rmSync(path.join(pgliteDist, f));
// Remove anything that must never ship.
for (const f of [".env", ".env.local"]) rmSync(path.join(out, f), { force: true });
rmSync(path.join(out, "storage"), { recursive: true, force: true });
console.log(`Server ready in ${out}`);
