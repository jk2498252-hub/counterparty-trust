// Offline recovery for a lost sole-admin authenticator. Requires control of the
// server or desktop data directory, and creates an audit record. Close the
// desktop app first. Usage: npm run user:recover -- --email admin@example.com
import bcrypt from "bcryptjs";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync } from "node:fs";
import { askPassword } from "./password-prompt.mjs";

const position = process.argv.indexOf("--email");
const email = position >= 0 ? process.argv[position + 1]?.toLowerCase() : undefined;
if (!email?.includes("@")) throw new Error("Pass --email for the existing administrator account");
if (!process.env.DATABASE_URL) {
  const lock = `${process.env.PGLITE_DIR ?? "./storage/db"}.lock`;
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    try { process.kill(pid, 0); throw new Error("Close the desktop app before recovering its administrator"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}
const password = await askPassword("New temporary password (12+ characters): ");
if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) throw new Error("Password must have at least 12 characters, within 72 UTF-8 bytes");
const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const client = pool ? await pool.connect() : new PGlite(process.env.PGLITE_DIR ?? "./storage/db");
try {
  await client.query("BEGIN");
  const locked = await client.query("SELECT id FROM app_locks WHERE id='workflow' FOR UPDATE");
  if (!locked.rows.length) throw new Error("Run database migrations first");
  const user = await client.query("SELECT id FROM users WHERE email=$1 AND role='ADMIN'", [email]);
  if (user.rows.length !== 1) throw new Error("Existing administrator not found");
  const id = user.rows[0].id;
  await client.query("UPDATE users SET password_hash=$1, totp_secret_enc=NULL, totp_enabled=false, failed_logins=0, locked_until=NULL, failed_mfa_attempts=0, mfa_locked_until=NULL, must_change_password=true, session_version=session_version+1, active=true WHERE id=$2", [await bcrypt.hash(password, 12), id]);
  await client.query("INSERT INTO audit_events(action, detail) VALUES ('auth.admin_recovered', $1::jsonb)", [JSON.stringify({ userId: id, method: "operator_cli" })]);
  await client.query("COMMIT");
  console.log("Administrator recovered. Sign in, replace the temporary password and enrol a new authenticator. All previous sessions are invalid.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  if (pool) { client.release(); await pool.end(); }
  else await client.close();
}
