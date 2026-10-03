// Creates three demo accounts for trying the app locally (never in production).
// Usage: npm run demo:users
import bcrypt from "bcryptjs";
import pg from "pg";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to create demo accounts in production.");
  process.exit(1);
}
const people = [
  ["admin@example.test", "Amina Admin", "ADMIN", "admin-password-123"],
  ["analyst@example.test", "Brian Analyst", "ANALYST", "analyst-password-123"],
  ["reviewer@example.test", "Wanjiru Reviewer", "REVIEWER", "reviewer-password-123"],
];
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
for (const [email, name, role, password] of people) {
  await pool.query(
    "insert into users (email, name, role, password_hash) values ($1, $2, $3, $4) on conflict (email) do nothing",
    [email, name, role, await bcrypt.hash(password, 12)],
  );
  console.log(`${role.padEnd(8)} ${email}  /  ${password}`);
}
await pool.end();
