"use server";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { back, str } from "@/lib/nav";
import { verifyCode, verifySetupSignature } from "@/lib/mfa";
import { endSession, getPendingMfaUser, getSessionUser, mfaRequired, requireUser, startPendingMfa, startSession } from "@/lib/session";

const MAX_FAILED = 5;
// Compared against when the email is unknown, so response time does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
const LOCK_MINUTES = 15;

export async function loginAction(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const [u] = await db.select().from(users).where(eq(users.email, email));
  // Same message for every failure so the form does not reveal which emails exist.
  const generic = "Email or password is incorrect, or the account is locked.";
  if (!u || !u.active) {
    await bcrypt.compare(password, DUMMY_HASH);
    back("/login", { err: generic });
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) back("/login", { err: generic });

  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) {
    const failed = u.failedLogins + 1;
    await db
      .update(users)
      .set({ failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null })
      .where(eq(users.id, u.id));
    await audit(u.id, "auth.login_failed", { lockedOut: failed >= MAX_FAILED });
    back("/login", { err: generic });
  }

  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, u.id));

  if (u.totpEnabled) {
    await startPendingMfa(u);
    redirect("/login/mfa");
  }
  await startSession(u, false);
  await audit(u.id, "auth.login", { mfa: false });
  redirect(mfaRequired() ? "/security" : "/");
}

export async function verifyMfaLoginAction(fd: FormData) {
  const u = await getPendingMfaUser();
  if (!u || !u.totpSecretEnc) redirect("/login");
  if (!verifyCode(decrypt(u.totpSecretEnc), str(fd, "code"))) {
    await audit(u.id, "auth.mfa_failed");
    back("/login/mfa", { err: "That code did not work. Check your authenticator app and try again." });
  }
  await startSession(u, true);
  await audit(u.id, "auth.login", { mfa: true });
  redirect("/");
}

export async function logoutAction() {
  const u = await getSessionUser();
  if (u) await audit(u.id, "auth.logout");
  await endSession();
  redirect("/login");
}

export async function confirmMfaSetupAction(fd: FormData) {
  const u = await requireUser({ allowMfaSetup: true });
  const secret = str(fd, "secret");
  const sig = str(fd, "sig");
  if (!secret || !verifySetupSignature(u.id, secret, sig)) back("/security?setup=1", { err: "Setup expired. Scan the new QR code." });
  if (!verifyCode(secret, str(fd, "code"))) {
    back("/security?setup=1", { err: "That code did not work. Scan the QR code again and enter the 6-digit code." });
  }
  await db.update(users).set({ totpSecretEnc: encrypt(secret), totpEnabled: true }).where(eq(users.id, u.id));
  await startSession({ ...u, totpEnabled: true }, true);
  await audit(u.id, u.totpEnabled ? "auth.mfa_replaced" : "auth.mfa_enabled");
  back("/security", { ok: "Two-factor login is on." });
}

export async function changePasswordAction(fd: FormData) {
  const u = await requireUser({ allowMfaSetup: true });
  const current = str(fd, "current");
  const next = str(fd, "next");
  if (next.length < 12) back("/security", { err: "New password must be at least 12 characters." });
  if (!(await bcrypt.compare(current, u.passwordHash))) back("/security", { err: "Current password is incorrect." });
  const sessionVersion = u.sessionVersion + 1; // signs out every other session
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 12), sessionVersion }).where(eq(users.id, u.id));
  await startSession({ ...u, sessionVersion }, u.mfaPassed);
  await audit(u.id, "auth.password_changed");
  back("/security", { ok: "Password changed. Other sessions were signed out." });
}

/** First run only: creates the first admin when there are no users at all. */
export async function createFirstAdminAction(fd: FormData) {
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!name || !email.includes("@")) back("/setup", { err: "Enter your name and email." });
  if (password.length < 12) back("/setup", { err: "Choose a password of at least 12 characters." });
  if (password !== str(fd, "confirm")) back("/setup", { err: "The two passwords don't match." });
  const passwordHash = await bcrypt.hash(password, 12);
  const created = await db.transaction(async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
    if (n > 0) return null;
    const [u] = await tx.insert(users).values({ name, email, role: "ADMIN", passwordHash }).returning();
    return u;
  });
  if (!created) redirect("/login");
  await audit(created.id, "setup.first_admin_created");
  await startSession(created, false);
  redirect("/security");
}
