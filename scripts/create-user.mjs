// Creates a user. Usage:
//   npm run user:create -- --email you@example.com --name "Your Name" --role ADMIN
// A temporary password is printed unless you pass --password (12+ characters).
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const email = arg("email")?.toLowerCase();
const name = arg("name");
const role = (arg("role") ?? "ADMIN").toUpperCase();
if (!email || !name || !["ADMIN", "ANALYST", "REVIEWER"].includes(role)) {
  console.error('Usage: npm run user:create -- --email you@example.com --name "Your Name" --role ADMIN|ANALYST|REVIEWER');
  process.exit(1);
}
const password = arg("password") ?? randomBytes(12).toString("base64url");
if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
  console.error("Password must have at least 12 characters, within 72 UTF-8 bytes.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const lock = await client.query("SELECT id FROM app_locks WHERE id = 'workflow' FOR UPDATE");
  if (!lock.rowCount) throw new Error("Run database migrations before creating accounts.");
  await client.query("insert into users (email, name, role, password_hash, must_change_password) values ($1, $2, $3, $4, true)", [email, name, role, await bcrypt.hash(password, 12)]);
  await client.query("COMMIT");
  console.log(`Created ${role.toLowerCase()} ${name} <${email}>`);
  if (!arg("password")) console.log(`Temporary password: ${password}`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e.code === "23505" ? "A user with that email already exists." : e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
