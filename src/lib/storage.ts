import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { onRollback } from "./transaction";

// Local disk storage for uploaded documents. Files are stored under random names,
// outside the public folder, and only served through an authenticated route.
// For production on multiple servers, swap this module for S3-compatible storage.

function root(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./storage/uploads");
}

export async function saveFile(bytes: Buffer, ext: string): Promise<string> {
  const dir = root();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const name = `${randomUUID()}.${ext}`;
  const file = path.join(/*turbopackIgnore: true*/ dir, name);
  onRollback(() => rm(file, { force: true }));
  await writeFile(file, bytes, { mode: 0o600, flag: "wx" });
  return name;
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  if (!/^[0-9a-f-]{36}\.[a-z]{2,5}$/.test(storedName)) throw new Error("Invalid stored file name");
  return readFile(path.join(/*turbopackIgnore: true*/ root(), storedName));
}
