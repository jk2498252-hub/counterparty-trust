// Fail a release if latest.yml refers to the wrong version or altered installer.
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const dir = path.resolve(process.argv[2] ?? "desktop/dist");
const version = JSON.parse(readFileSync("desktop/package.json", "utf8")).version;
const installer = `Counterparty-Trust-Setup-${version}.exe`;
const manifest = readFileSync(path.join(dir, "latest.yml"), "utf8");
const field = (key) => manifest.match(new RegExp(`^${key}:\\s*['\"]?([^'\"\\r\\n]+)`, "m"))?.[1].trim();
if (field("version") !== version || field("path") !== installer) throw new Error("Updater manifest points at another version or installer");
const bytes = readFileSync(path.join(dir, installer));
const hash = createHash("sha512").update(bytes).digest("base64");
if (field("sha512") !== hash) throw new Error("Installer does not match the manifest's SHA-512");
if (!statSync(path.join(dir, `${installer}.blockmap`)).size) throw new Error("Installer blockmap is missing or empty");
console.log(`✓ Installer, blockmap and latest.yml agree for v${version}`);
