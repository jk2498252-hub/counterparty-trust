import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

// Two ways to run:
//  - Server: DATABASE_URL points at a PostgreSQL server.
//  - Desktop / single computer: no DATABASE_URL. A built-in PostgreSQL (PGlite)
//    stores data in PGLITE_DIR on this computer.

type DB = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __kctDb?: DB; __kctPglite?: PGlite; __kctPool?: Pool };

function create(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    g.__kctPool = new Pool({ connectionString: url, max: 10 });
    return drizzlePg(g.__kctPool, { schema });
  }
  const dir = process.env.PGLITE_DIR ?? "./storage/db";
  g.__kctPglite = new PGlite(dir);
  // Same query API; PGlite speaks the PostgreSQL dialect.
  return drizzlePglite(g.__kctPglite, { schema }) as unknown as DB;
}

function getDb(): DB {
  if (!g.__kctDb) g.__kctDb = create();
  return g.__kctDb;
}

/** Lazily connected: nothing opens until the first query. */
export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb();
    const v = Reflect.get(real, prop, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});

/** Called by the desktop launcher before the app quits, so the built-in database closes cleanly. */
export async function closeDb() {
  await g.__kctPglite?.close();
  await g.__kctPool?.end();
}

export { schema };
