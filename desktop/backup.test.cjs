const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createBackup, restoreBackup } = require("./backup");

test("encrypted backups restore captures and keys, reject tampering and never overwrite live data", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "kct-backup-"));
  try {
    const root = path.join(folder, "live");
    await fs.mkdir(path.join(root, "documents"), { recursive: true });
    await fs.writeFile(path.join(root, "config.json"), '{"key":"highly-sensitive-encryption-key"}');
    await fs.writeFile(path.join(root, "documents", "source.txt"), "Sensitive client source");
    await fs.writeFile(path.join(root, "database.lock"), "123");
    const backup = path.join(folder, "copy.kctbackup");
    const password = "independent-backup-password";
    await createBackup(root, backup, password);
    const encrypted = await fs.readFile(backup);
    assert.equal(encrypted.includes(Buffer.from("highly-sensitive-encryption-key")), false);
    assert.equal(encrypted.includes(Buffer.from("Sensitive client source")), false);
    const restored = path.join(folder, "restored");
    await restoreBackup(backup, restored, password);
    assert.equal(await fs.readFile(path.join(restored, "documents", "source.txt"), "utf8"), "Sensitive client source");
    assert.equal(await fs.readFile(path.join(restored, "config.json"), "utf8"), '{"key":"highly-sensitive-encryption-key"}');
    await assert.rejects(fs.stat(path.join(restored, "database.lock")));
    await assert.rejects(restoreBackup(backup, root, password), /already exists/);
    const badRestore = path.join(folder, "bad-restore");
    await assert.rejects(restoreBackup(backup, badRestore, "wrong-backup-password"));
    await assert.rejects(fs.stat(badRestore));
    encrypted[encrypted.length - 1] ^= 1;
    await fs.writeFile(backup, encrypted);
    await assert.rejects(restoreBackup(backup, badRestore, password));
    await assert.rejects(fs.stat(badRestore));
    await assert.rejects(createBackup(root, path.join(root, "nested.kctbackup"), password), /outside/);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});
