import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function hasAnyUser(): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return n > 0;
}
