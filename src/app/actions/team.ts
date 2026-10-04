"use server";

import { runWorkflow } from "@/lib/transaction";

import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { back, isUuid, passwordStr, str } from "@/lib/nav";
import { requireUser } from "@/lib/session";
import { validPassword } from "@/lib/password";

const ROLES = ["ADMIN", "ANALYST", "REVIEWER"] as const;

export async function createUserAction(fd: FormData) {
  return runWorkflow(async () => {
    const admin = await requireUser({ roles: ["ADMIN"] });
    const email = str(fd, "email").toLowerCase();
    const name = str(fd, "name");
    const role = str(fd, "role") as (typeof ROLES)[number];
    if (!email.includes("@") || !name || !ROLES.includes(role)) back("/team", { err: "Enter a name, a valid email and a role." });
    const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (dupe) back("/team", { err: "A user with that email already exists." });
    const password = passwordStr(fd, "password");
    if (!validPassword(password)) back("/team", { err: "Choose an initial password with at least 12 characters, within 72 UTF-8 bytes." });
    const [u] = await db.insert(users).values({ email, name, role, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true }).returning();
    await audit(admin.id, "team.user_created", { userId: u.id, role });
    back("/team", { ok: `Account created for ${name}. Share the initial password privately. They must change it after signing in.` });
  });
}

export async function updateUserAction(fd: FormData) {
  return runWorkflow(async () => {
    const admin = await requireUser({ roles: ["ADMIN"] });
    const id = str(fd, "id");
    if (!isUuid(id)) back("/team", { err: "Invalid user" });
    const op = str(fd, "op");
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) back("/team", { err: "User not found" });

    if (op === "role") {
      const role = str(fd, "role") as (typeof ROLES)[number];
      if (!ROLES.includes(role)) back("/team", { err: "Invalid role" });
      if (u.id === admin.id && role !== "ADMIN") back("/team", { err: "You cannot remove your own admin role." });
      await db.update(users).set({ role, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
    } else if (op === "deactivate") {
      if (u.id === admin.id) back("/team", { err: "You cannot deactivate yourself." });
      await db.update(users).set({ active: false, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
    } else if (op === "activate") {
      await db.update(users).set({ active: true, failedLogins: 0, lockedUntil: null, failedMfaAttempts: 0, mfaLockedUntil: null }).where(eq(users.id, id));
    } else if (op === "reset") {
      const password = passwordStr(fd, "password");
      if (!validPassword(password)) back("/team", { err: "Choose a reset password with at least 12 characters, within 72 UTF-8 bytes." });
      await db
        .update(users)
        .set({
          passwordHash: await bcrypt.hash(password, 12),
          totpEnabled: false,
          totpSecretEnc: null,
          failedLogins: 0,
          lockedUntil: null,
          failedMfaAttempts: 0,
          mfaLockedUntil: null,
          mustChangePassword: true,
          sessionVersion: sql`${users.sessionVersion} + 1`,
        })
        .where(eq(users.id, id));
      await audit(admin.id, "team.user_reset", { userId: id });
      back("/team", { ok: `Password and two-factor reset for ${u.name}. Share the reset password privately. They must change it after signing in.` });
    } else back("/team", { err: "Unknown action" });

    await audit(admin.id, `team.user_${op}`, { userId: id });
    back("/team", { ok: "Updated." });
  });
}
