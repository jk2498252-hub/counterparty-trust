const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { stopServerProcess } = require("./lifecycle");

function child() {
  const proc = new EventEmitter();
  proc.exitCode = null;
  proc.signalCode = null;
  proc.send = () => {};
  proc.kill = () => { throw new Error("Never kill the DB and treat it as a successful close"); };
  return proc;
}

test("backup/update waits for an actual successful exit", async () => {
  const proc = child();
  let complete = false;
  const stopped = stopServerProcess(proc).then(() => { complete = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(complete, false);
  proc.emit("exit", 0, null);
  await stopped;
  assert.equal(complete, true);
});

test("timeout cancels backup/update while the server remains running", async () => {
  const proc = child();
  await assert.rejects(stopServerProcess(proc, 10), /still busy/);
  assert.equal(proc.exitCode, null);
  assert.equal(proc.listenerCount("exit"), 0);
});

test("an unsuccessful close cancels backup/update", async () => {
  const proc = child();
  const stopped = stopServerProcess(proc);
  proc.emit("exit", 1, null);
  await assert.rejects(stopped, /did not close cleanly/);
});

test("an IPC failure cancels backup/update", async () => {
  const proc = child();
  proc.send = (_message, callback) => callback(new Error("IPC closed"));
  await assert.rejects(stopServerProcess(proc), /Could not ask/);
});

test("an already failed process cannot be used as a clean backup/update boundary", async () => {
  const proc = child();
  proc.exitCode = 1;
  await assert.rejects(stopServerProcess(proc), /did not close cleanly/);
});
