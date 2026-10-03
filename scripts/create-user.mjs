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
if (password.length < 12) {
  console.error("Password must be at least 12 characters.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query("insert into users (email, name, role, password_hash) values ($1, $2, $3, $4)", [email, name, role, await bcrypt.hash(password, 12)]);
  console.log(`Created ${role.toLowerCase()} ${name} <${email}>`);
  if (!arg("password")) console.log(`Temporary password: ${password}`);
} catch (e) {
  console.error(e.code === "23505" ? "A user with that email already exists." : e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
