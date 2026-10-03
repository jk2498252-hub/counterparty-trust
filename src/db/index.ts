import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

function getPool(): Pool {
  if (!globalForDb.pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.pool = new Pool({ connectionString: url, max: 10 });
  }
  return globalForDb.pool;
}

export const db = drizzle(getPool(), { schema });
export type DB = typeof db;
export { schema };
