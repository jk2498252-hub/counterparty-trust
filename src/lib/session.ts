import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

const SESSION_COOKIE = "kct_session";
const PENDING_COOKIE = "kct_mfa_pending";
const SESSION_HOURS = 10;

export type Role = User["role"];

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export function mfaRequired(): boolean {
  return process.env.REQUIRE_MFA !== "false";
}

const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

async function sign(payload: Record<string, unknown>, seconds: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + seconds)
    .sign(secret());
}

async function verify(token: string | undefined) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload as { sub: string; sv: number; mfa?: boolean; kind: string };
  } catch {
    return null;
  }
}

export async function startSession(user: User, mfaPassed: boolean) {
  const jar = await cookies();
  jar.delete(PENDING_COOKIE);
  jar.set(SESSION_COOKIE, await sign({ sub: user.id, sv: user.sessionVersion, mfa: mfaPassed, kind: "session" }, SESSION_HOURS * 3600), {
    ...cookieBase,
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function startPendingMfa(user: User) {
  const jar = await cookies();
  jar.set(PENDING_COOKIE, await sign({ sub: user.id, sv: user.sessionVersion, kind: "pending" }, 300), { ...cookieBase, maxAge: 300 });
}

export async function getPendingMfaUser(): Promise<User | null> {
  const jar = await cookies();
  const p = await verify(jar.get(PENDING_COOKIE)?.value);
  if (!p || p.kind !== "pending") return null;
  const [u] = await db.select().from(users).where(eq(users.id, p.sub));
  if (!u || !u.active || u.sessionVersion !== p.sv) return null;
  return u;
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PENDING_COOKIE);
}

export interface SessionUser extends User {
  mfaPassed: boolean;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const p = await verify(jar.get(SESSION_COOKIE)?.value);
  if (!p || p.kind !== "session") return null;
  const [u] = await db.select().from(users).where(eq(users.id, p.sub));
  if (!u || !u.active || u.sessionVersion !== p.sv) return null;
  return { ...u, mfaPassed: !!p.mfa };
}

/**
 * Use at the top of every protected page and every server action.
 * Redirects to login, or to MFA setup when MFA is required but not yet enrolled.
 */
export async function requireUser(opts: { roles?: Role[]; allowMfaSetup?: boolean } = {}): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (mfaRequired() && !u.mfaPassed && !opts.allowMfaSetup) redirect("/security");
  if (opts.roles && !opts.roles.includes(u.role)) redirect("/?denied=1");
  return u;
}

export function isPrivileged(role: Role) {
  return role === "ADMIN" || role === "REVIEWER";
}
