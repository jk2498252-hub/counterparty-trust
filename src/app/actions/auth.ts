"use server";

import { runWorkflow } from "@/lib/transaction";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { back, passwordStr, str } from "@/lib/nav";
import { verifyCode, verifySetupSignature } from "@/lib/mfa";
import { endSession, getPendingMfaUser, getSessionUser, mfaRequired, requireUser, startPendingMfa, startSession } from "@/lib/session";
import { firstRunAllowed, hasAnyUser } from "@/lib/setup";
import { validPassword } from "@/lib/password";

const MAX_FAILED = 5;
// Compared against when the email is unknown, so response time does not reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);
const LOCK_MINUTES = 15;

async function failedMfa(u: typeof users.$inferSelect) {
  const attempts = u.failedMfaAttempts + 1;
  await db.update(users).set({
    failedMfaAttempts: attempts >= MAX_FAILED ? 0 : attempts,
    mfaLockedUntil: attempts >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
  }).where(eq(users.id, u.id));
  await audit(u.id, "auth.mfa_failed", { lockedOut: attempts >= MAX_FAILED });
}

export async function loginAction(fd: FormData) {
  return runWorkflow(async () => {
    const email = str(fd, "email").toLowerCase();
    const password = passwordStr(fd, "password");
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
    redirect(mfaRequired() || u.mustChangePassword ? "/security" : "/");
  }, { commitErrorRedirects: true });
}

export async function verifyMfaLoginAction(fd: FormData) {
  return runWorkflow(async () => {
    const u = await getPendingMfaUser();
    if (!u || !u.totpSecretEnc) redirect("/login");
    if (u.mfaLockedUntil && u.mfaLockedUntil > new Date()) back("/login/mfa", { err: "Too many failed codes. Try again in 15 minutes." });
    if (!verifyCode(decrypt(u.totpSecretEnc), str(fd, "code"))) {
      await failedMfa(u);
      back("/login/mfa", { err: "That code did not work. Check your authenticator app and try again." });
    }
    await db.update(users).set({ failedMfaAttempts: 0, mfaLockedUntil: null }).where(eq(users.id, u.id));
    await startSession(u, true);
    await audit(u.id, "auth.login", { mfa: true });
    redirect(u.mustChangePassword ? "/security" : "/");
  }, { commitErrorRedirects: true });
}

export async function logoutAction() {
  return runWorkflow(async () => {
    const u = await getSessionUser();
    if (u) await audit(u.id, "auth.logout");
    await endSession();
    redirect("/login");
  }, { commitErrorRedirects: true });
}

export async function confirmMfaSetupAction(fd: FormData) {
  return runWorkflow(async () => {
    const u = await requireUser({ allowMfaSetup: true });
    const secret = str(fd, "secret");
    const sig = str(fd, "sig");
    if (u.mfaLockedUntil && u.mfaLockedUntil > new Date()) back("/security", { err: "Too many failed codes. Try again in 15 minutes." });
    if (!verifySetupSignature(u.id, u.sessionVersion, secret, Number(str(fd, "expires")), sig)) back("/security?setup=1", { err: "Setup expired. Scan the new QR code." });
    if (u.totpEnabled) {
      const passwordOk = await bcrypt.compare(passwordStr(fd, "currentPassword"), u.passwordHash);
      const factorOk = !!u.totpSecretEnc && verifyCode(decrypt(u.totpSecretEnc), str(fd, "currentCode"));
      if (!passwordOk || !factorOk) {
        await failedMfa(u);
        back("/security?setup=1", { err: "Enter your current password and a code from your existing authenticator." });
      }
    }
    if (!verifyCode(secret, str(fd, "code"))) {
      await failedMfa(u);
      back("/security?setup=1", { err: "That code did not work. Scan the QR code again and enter the 6-digit code." });
    }
    const sessionVersion = u.sessionVersion + 1;
    await db.update(users).set({ totpSecretEnc: encrypt(secret), totpEnabled: true, sessionVersion, failedMfaAttempts: 0, mfaLockedUntil: null }).where(eq(users.id, u.id));
    await startSession({ ...u, totpEnabled: true, sessionVersion }, true);
    await audit(u.id, u.totpEnabled ? "auth.mfa_replaced" : "auth.mfa_enabled");
    back("/security", { ok: "Two-factor login is on." });
  }, { commitErrorRedirects: true });
}

export async function changePasswordAction(fd: FormData) {
  return runWorkflow(async () => {
    const u = await requireUser({ allowMfaSetup: true });
    const current = passwordStr(fd, "current");
    const next = passwordStr(fd, "next");
    if (!validPassword(next)) back("/security", { err: "New password must have at least 12 characters and fit within 72 UTF-8 bytes." });
    if (current === next) back("/security", { err: "Choose a different password." });
    if (!(await bcrypt.compare(current, u.passwordHash))) back("/security", { err: "Current password is incorrect." });
    const sessionVersion = u.sessionVersion + 1; // signs out every other session
    await db.update(users).set({ passwordHash: await bcrypt.hash(next, 12), sessionVersion, mustChangePassword: false }).where(eq(users.id, u.id));
    await startSession({ ...u, sessionVersion, mustChangePassword: false }, u.mfaPassed);
    await audit(u.id, "auth.password_changed");
    back("/security", { ok: "Password changed. Other sessions were signed out." });
  }, { commitErrorRedirects: true });
}

/** First run only: creates the first admin when there are no users at all. */
export async function createFirstAdminAction(fd: FormData) {
  return runWorkflow(async () => {
    if (!firstRunAllowed(passwordStr(fd, "setupToken"))) back("/setup", { err: "First-run setup is unavailable or the setup token is incorrect." });
    if (await hasAnyUser()) redirect("/login");
    const name = str(fd, "name");
    const email = str(fd, "email").toLowerCase();
    const password = passwordStr(fd, "password");
    if (!name || !email.includes("@")) back("/setup", { err: "Enter your name and email." });
    if (!validPassword(password)) back("/setup", { err: "Choose a password with at least 12 characters, within 72 UTF-8 bytes." });
    if (password !== passwordStr(fd, "confirm")) back("/setup", { err: "The two passwords don't match." });
    const passwordHash = await bcrypt.hash(password, 12);
    const [created] = await db.insert(users).values({ name, email, role: "ADMIN", passwordHash }).returning();
    await audit(created.id, "setup.first_admin_created");
    await startSession(created, false);
    redirect("/security");
  }, { commitErrorRedirects: true });
}
