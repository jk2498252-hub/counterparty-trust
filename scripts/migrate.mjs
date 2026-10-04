// Applies database migrations. Usage: npm run db:migrate
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzleLocal } from "drizzle-orm/pglite";
import { migrate as migrateLocal } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const connection = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : new PGlite(process.env.PGLITE_DIR ?? "./storage/db");
try {
  if (connection instanceof PGlite) await migrateLocal(drizzleLocal(connection), { migrationsFolder: "./drizzle" });
  else await migratePg(drizzlePg(connection), { migrationsFolder: "./drizzle" });
  console.log("Database is up to date.");
} finally {
  if (connection instanceof PGlite) await connection.close();
  else await connection.end();
}
