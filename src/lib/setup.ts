import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { timingSafeEqual } from "node:crypto";

/** Public production instances have no anonymous first-admin claim. */
export function firstRunMode(): "local" | "token" | "disabled" {
  if (process.env.NODE_ENV !== "production") return "local";
  if (process.env.ALLOW_FIRST_RUN_SETUP === "true" && process.env.HOSTNAME === "127.0.0.1" && !process.env.DATABASE_URL) return "local";
  if ((process.env.SETUP_TOKEN?.length ?? 0) >= 32) return "token";
  return "disabled";
}

export function firstRunAllowed(token: string): boolean {
  const mode = firstRunMode();
  if (mode === "local") return true;
  if (mode === "disabled") return false;
  const expected = Buffer.from(process.env.SETUP_TOKEN!);
  const supplied = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function hasAnyUser(): Promise<boolean> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users);
  return n > 0;
}
