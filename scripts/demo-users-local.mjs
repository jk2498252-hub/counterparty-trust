// Creates the three demo accounts in the built-in (desktop) database.
// The app must be closed while this runs. Usage: PGLITE_DIR=<folder> node scripts/demo-users-local.mjs
import bcrypt from "bcryptjs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const dir = process.env.PGLITE_DIR;
if (!dir) throw new Error("Set PGLITE_DIR");
const client = new PGlite(dir);
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
for (const [email, name, role, password] of [
  ["admin@example.test", "Amina Admin", "ADMIN", "admin-password-123"],
  ["analyst@example.test", "Brian Analyst", "ANALYST", "analyst-password-123"],
  ["reviewer@example.test", "Wanjiru Reviewer", "REVIEWER", "reviewer-password-123"],
]) {
  await client.query("insert into users (email, name, role, password_hash) values ($1, $2, $3, $4) on conflict (email) do nothing", [email, name, role, await bcrypt.hash(password, 12)]);
}
await client.close();
console.log("Demo accounts ready.");
