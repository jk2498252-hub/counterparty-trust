/** Wait for an actual, successful exit; a timeout never means the DB is closed. */
function stopServerProcess(proc, timeoutMs = 30_000) {
  if (!proc) return Promise.resolve();
  if (proc.exitCode !== null || proc.signalCode) return proc.exitCode === 0 && !proc.signalCode
    ? Promise.resolve() : Promise.reject(new Error("The database did not close cleanly. Backup or update was cancelled."));
  return new Promise((resolve, reject) => {
    const done = (code, signal) => {
      clearTimeout(timer);
      proc.removeListener("error", failed);
      if (code === 0 && !signal) resolve();
      else reject(new Error("The database did not close cleanly. Backup or update was cancelled."));
    };
    const failed = () => {
      clearTimeout(timer);
      proc.removeListener("exit", done);
      reject(new Error("Could not ask the workbench to close. Backup or update was cancelled."));
    };
    const timer = setTimeout(() => {
      proc.removeListener("exit", done);
      proc.removeListener("error", failed);
      reject(new Error("The workbench is still busy. Try again after its current operation finishes."));
    }, timeoutMs);
    proc.once("exit", done);
    proc.once("error", failed);
    try { proc.send("shutdown", (error) => error && failed()); } catch { failed(); }
  });
}

module.exports = { stopServerProcess };
