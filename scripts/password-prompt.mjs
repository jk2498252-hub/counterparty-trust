import { createInterface } from "node:readline";
import { Writable } from "node:stream";

/** Read a secret without echoing it or accepting it as a command-line argument. */
export async function askPassword(prompt = "Password: ") {
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, next) { if (!muted) process.stdout.write(chunk); next(); } });
  const input = createInterface({ input: process.stdin, output, terminal: !!process.stdin.isTTY });
  const value = await new Promise((resolve, reject) => {
    input.once("close", () => reject(new Error("Password input was closed")));
    input.question(prompt, resolve);
    muted = true;
  });
  input.close();
  process.stdout.write("\n");
  return value;
}
