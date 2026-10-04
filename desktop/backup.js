// Portable, authenticated backups. The password is independent of config.json,
// so database files, source captures and their encryption keys travel encrypted.
const fs = require("node:fs/promises");
const { createReadStream, createWriteStream } = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { createGzip, createGunzip } = require("node:zlib");
const { randomBytes, scrypt, createCipheriv, createDecipheriv } = require("node:crypto");
const { promisify } = require("node:util");

const MAGIC = Buffer.from("KCTBACKUP1\n");
const HEADER_SIZE = MAGIC.length + 16 + 12;
const deriveKey = (password, salt) => promisify(scrypt)(password, salt, 32, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
const validPassword = password => typeof password === "string" && password.length >= 12 && password.length <= 1024;

async function* records(root, directory = "") {
  const entries = await fs.readdir(path.join(root, directory), { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.posix.join(directory, entry.name);
    if (entry.name.endsWith(".lock")) continue;
    if (entry.isSymbolicLink()) throw new Error("Backups cannot include symbolic links");
    if (entry.isDirectory()) {
      // PostgreSQL needs its empty internal directories as well as its files.
      const metadata = Buffer.from(JSON.stringify({ path: relative, size: null }));
      if (metadata.length > 4096) throw new Error("Backup directory path is too long");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(metadata.length);
      yield length;
      yield metadata;
      yield* records(root, relative);
    }
    else if (entry.isFile()) {
      const file = path.join(root, relative);
      const { size } = await fs.stat(file);
      const metadata = Buffer.from(JSON.stringify({ path: relative, size }));
      if (metadata.length > 4096) throw new Error("Backup file path is too long");
      const length = Buffer.alloc(4);
      length.writeUInt32BE(metadata.length);
      yield length;
      yield metadata;
      yield* createReadStream(file);
    }
  }
}

async function createBackup(root, destination, password) {
  if (!validPassword(password)) throw new Error("Use a backup password of at least 12 characters");
  const relative = path.relative(path.resolve(root), path.resolve(destination));
  if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) throw new Error("Save the backup outside the live data folder");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = Buffer.concat([MAGIC, salt, iv]);
  const cipher = createCipheriv("aes-256-gcm", await deriveKey(password, salt), iv);
  cipher.setAAD(header);
  await fs.writeFile(destination, header, { flag: "wx", mode: 0o600 });
  try {
    const archive = async function* () { yield* records(root); yield Buffer.alloc(4); };
    await pipeline(Readable.from(archive()), createGzip(), cipher, createWriteStream(destination, { flags: "a" }));
    await fs.appendFile(destination, cipher.getAuthTag());
    const file = await fs.open(destination, "r+");
    try { await file.sync(); } finally { await file.close(); }
  } catch (error) {
    await fs.rm(destination, { force: true });
    throw error;
  }
}

// Restore only into a new directory. No existing live data is overwritten.
async function restoreBackup(source, destination, password) {
  if (!validPassword(password)) throw new Error("Backup password is invalid");
  try { await fs.stat(destination); throw new Error("Restore destination already exists"); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const input = await fs.open(source, "r");
  const { size } = await input.stat();
  const header = Buffer.alloc(HEADER_SIZE);
  const tag = Buffer.alloc(16);
  try {
    if (size < HEADER_SIZE + 20) throw new Error("Backup is incomplete");
    await input.read(header, 0, header.length, 0);
    await input.read(tag, 0, tag.length, size - 16);
  } finally { await input.close(); }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Unknown backup format");
  const decipher = createDecipheriv("aes-256-gcm", await deriveKey(password, header.subarray(MAGIC.length, MAGIC.length + 16)), header.subarray(MAGIC.length + 16));
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const staging = await fs.mkdtemp(path.join(path.dirname(destination), ".kct-restore-"));
  let gunzip;
  let transfer;
  try {
    gunzip = createGunzip();
    transfer = pipeline(createReadStream(source, { start: HEADER_SIZE, end: size - 17 }), decipher, gunzip);
    // Observe pipeline errors immediately while the extractor is consuming it.
    transfer.catch(() => {});
    const iterator = gunzip[Symbol.asyncIterator]();
    let pending = Buffer.alloc(0);
    async function read(bytes) {
      const chunks = [];
      let remaining = bytes;
      while (remaining) {
        if (!pending.length) {
          const next = await iterator.next();
          if (next.done) throw new Error("Backup is incomplete");
          pending = next.value;
        }
        const n = Math.min(remaining, pending.length);
        chunks.push(pending.subarray(0, n));
        pending = pending.subarray(n);
        remaining -= n;
      }
      return Buffer.concat(chunks, bytes);
    }
    let count = 0;
    while (true) {
      const length = (await read(4)).readUInt32BE();
      if (!length) break;
      if (length > 4096 || ++count > 100_000) throw new Error("Invalid backup archive");
      const record = JSON.parse((await read(length)).toString("utf8"));
      if (typeof record.path !== "string" || !record.path || record.path.split("/").some(part => !part || part === "." || part === "..") || /[\\:\0]/.test(record.path)) throw new Error("Unsafe backup record");
      const target = path.join(staging, record.path);
      if (record.size === null) { await fs.mkdir(target, { recursive: true, mode: 0o700 }); continue; }
      if (!Number.isSafeInteger(record.size) || record.size < 0 || record.size > 100 * 1024 ** 3) throw new Error("Unsafe backup record");
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const output = await fs.open(target, "wx", 0o600);
      try {
        for (let remaining = record.size; remaining > 0;) {
          const chunk = await read(Math.min(remaining, 64 * 1024));
          await output.writeFile(chunk);
          remaining -= chunk.length;
        }
      } finally { await output.close(); }
    }
    if (pending.length || !(await iterator.next()).done) throw new Error("Unexpected backup data");
    await transfer; // GCM authentication must succeed before exposing the restore.
    await fs.rename(staging, destination);
  } catch (error) {
    gunzip?.destroy();
    await transfer?.catch(() => {});
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { createBackup, restoreBackup };
