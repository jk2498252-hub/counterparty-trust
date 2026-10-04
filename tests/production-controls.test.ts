import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { authenticator } from "otplib";

const request = vi.hoisted(() => ({ jar: null as null | { get: (name: string) => { value: string } | undefined; set: (name: string, value: string) => void; delete: (name: string) => void } }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => request.jar }));

import { db, closeDb } from "@/db";
import { users, clients, counterparties, cases, auditEvents, paymentInstructions, paymentApprovals, findings, evidence, findingEvidence, reports } from "@/db/schema";
import { runWorkflow } from "@/lib/transaction";
import { audit } from "@/lib/audit";
import { hasAnyUser, firstRunAllowed } from "@/lib/setup";
import { createFirstAdminAction, loginAction, verifyMfaLoginAction, confirmMfaSetupAction } from "@/app/actions/auth";
import { createUserAction } from "@/app/actions/team";
import { createCaseAction, reviewAction, releaseAction, updateFindingAction } from "@/app/actions/cases";
import { createInstructionAction, recordConfirmationAction, approveInstructionAction } from "@/app/actions/payments";
import { QC_CHECKLIST } from "@/lib/workflow";
import { newMfaSetup, verifySetupSignature } from "@/lib/mfa";
import { getSessionUser, startSession } from "@/lib/session";
import { saveFile } from "@/lib/storage";
import { touchCase } from "@/lib/cases";
import { checkUpload } from "@/lib/files";
import { canonicalJson, sha256 } from "@/lib/crypto";
import { documentMatches, reportMatches } from "@/lib/integrity";
import { evidenceDateRange } from "@/lib/freshness";
import { passwordStr } from "@/lib/nav";
import { validPassword } from "@/lib/password";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

let scratch: string;
let admin: typeof users.$inferSelect;
const jar = new Map<string, string>();
const cookieContext = new AsyncLocalStorage<Map<string, string>>();
const currentJar = () => cookieContext.getStore() ?? jar;
const fd = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
};
async function destination(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) {
    const url = isRedirectError(error) ? getURLFromRedirectError(error) : null;
    if (url) return url;
    throw error;
  }
  throw new Error("Expected a redirect");
}

beforeAll(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), "kct-controls-"));
  // GitHub CI uses its disposable PostgreSQL service; local runs use a fresh
  // built-in database. Never point this suite at a developer's database.
  if (process.env.CI !== "true") process.env.DATABASE_URL = "";
  process.env.PGLITE_DIR = path.join(scratch, "database");
  process.env.UPLOAD_DIR = path.join(scratch, "documents");
  process.env.SESSION_SECRET = "test-only-signing-secret-that-is-long-enough-12345";
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 8).toString("base64");
  process.env.REQUIRE_MFA = "false";
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (!process.env.DATABASE_URL) {
    const pglite = new PGlite(process.env.PGLITE_DIR);
    await migrate(drizzle(pglite), { migrationsFolder: "./drizzle" });
    await pglite.close();
  }
  request.jar = { get: (name) => currentJar().has(name) ? { value: currentJar().get(name)! } : undefined, set: (name, value) => { currentJar().set(name, value); }, delete: (name) => { currentJar().delete(name); } };
}, 60_000);

afterAll(async () => {
  await closeDb();
  await rm(scratch, { recursive: true, force: true });
});

describe("production workflow controls", () => {
  it("serialises simultaneous first-admin claims", async () => {
    expect(await hasAnyUser()).toBe(false);
    const form = (email: string) => fd({ name: "Test Admin", email, password: "first-admin-password", confirm: "first-admin-password" });
    const destinations = await Promise.all([
      destination(createFirstAdminAction(form("first@example.test"))),
      destination(createFirstAdminAction(form("second@example.test"))),
    ]);
    expect(destinations.sort()).toEqual(["/login", "/security"]);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    admin = rows[0];
  }, 30_000);

  it("rolls back new clients and suppliers when case validation fails", async () => {
    await startSession(admin, true);
    const result = await destination(createCaseAction(fd({ clientId: "new", clientName: "Rollback client", counterpartyId: "new", legalName: "Rollback supplier" })));
    expect(result).toContain("err=");
    expect(await db.select().from(clients).where(eq(clients.name, "Rollback client"))).toHaveLength(0);
    expect(await db.select().from(counterparties).where(eq(counterparties.legalName, "Rollback supplier"))).toHaveLength(0);
  });

  it("preserves both simultaneous edits and their audit records", async () => {
    const result = await destination(createCaseAction(fd({ clientId: "new", clientName: "Concurrency client", counterpartyId: "new", legalName: "Concurrency supplier", decisionPurpose: "Concurrent workflow regression" })));
    const id = result.split("/")[2].split("?")[0];
    await Promise.all(Array.from({ length: 12 }, (_, i) => runWorkflow(() => touchCase(id, admin.id, `edit ${i}`))));
    const [row] = await db.select().from(cases).where(eq(cases.id, id));
    expect(row.version).toBe(13);
    const events = await db.select().from(auditEvents).where(eq(auditEvents.caseId, id));
    expect(events.filter((e) => e.action === "case.changed")).toHaveLength(12);
    expect(new Set(events.filter((e) => e.action === "case.changed").map((e) => e.detail?.version)).size).toBe(12);
  }, 30_000);

  it("rolls back business writes and staged files if auditing fails", async () => {
    let stored = "";
    await expect(runWorkflow(async () => {
      await db.update(users).set({ name: "Must roll back" }).where(eq(users.id, admin.id));
      stored = await saveFile(Buffer.from("rollback file"), "txt");
      await audit("00000000-0000-0000-0000-000000000001", "test.audit_failure");
    })).rejects.toThrow();
    const [row] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(row.name).toBe(admin.name);
    await expect(readFile(path.join(process.env.UPLOAD_DIR!, stored))).rejects.toThrow();
  });

  it("keeps password failures and lockouts when the error redirect commits", async () => {
    for (let i = 0; i < 5; i++) await destination(loginAction(fd({ email: admin.email, password: "wrong-password" })));
    const [locked] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await destination(loginAction(fd({ email: admin.email, password: "first-admin-password" })))).toContain("err=");
    await db.update(users).set({ lockedUntil: null, failedLogins: 0 }).where(eq(users.id, admin.id));
  }, 30_000);

  it("creates an account without putting its password in the redirect and requires replacement", async () => {
    await startSession(admin, true);
    const password = "team-secret-password";
    const result = await destination(createUserAction(fd({ name: "Test Analyst", email: "controls-analyst@example.test", role: "ANALYST", password })));
    expect(decodeURIComponent(result)).not.toContain(password);
    const [user] = await db.select().from(users).where(eq(users.email, "controls-analyst@example.test"));
    expect(user.mustChangePassword).toBe(true);
  }, 30_000);

  it("counts concurrent approvals, invalidates concurrent review/edit, and releases a version only once", async () => {
    const [first, second] = await db.insert(users).values([
      { name: "First approver", email: "first-approver@example.test", role: "REVIEWER", passwordHash: admin.passwordHash },
      { name: "Second approver", email: "second-approver@example.test", role: "REVIEWER", passwordHash: admin.passwordHash },
    ]).returning();
    const [c] = await db.select().from(cases);
    const asUser = (user: typeof users.$inferSelect, action: () => Promise<unknown>) => cookieContext.run(new Map(), async () => {
      await startSession(user, true);
      return destination(action());
    });
    const instructionUrl = await asUser(admin, () => createInstructionAction(fd({ counterpartyId: c.counterpartyId, caseId: c.id, beneficiaryName: "Concurrency supplier", bankName: "Test bank", account: "1234567890", sourceDescription: "Independent test instruction" })));
    const instructionId = instructionUrl.split("/")[2];
    await asUser(admin, () => recordConfirmationAction(fd({ id: instructionId, confirmationChannel: "Known phone", channelEstablishedHow: "Existing record", channelIndependent: "true", confirmedWithName: "Test director" })));
    await Promise.all([first, second].map(user => asUser(user, () => approveInstructionAction(fd({ id: instructionId })))));
    const [payment] = await db.select().from(paymentInstructions).where(eq(paymentInstructions.id, instructionId));
    expect(payment.status).toBe("CONFIRMED_WITHIN_SCOPE");
    expect(await db.select().from(paymentApprovals).where(eq(paymentApprovals.instructionId, instructionId))).toHaveLength(2);

    // Complete an intentionally inconclusive case, with a documented source gap.
    const [source] = await db.insert(evidence).values({ caseId: c.id, code: "E01", sourceName: "Unavailable official source", category: "AUTHORITATIVE", accessResult: "NOT_SUPPLIED", checkedDate: "2026-10-03", summary: "Record unavailable", createdById: admin.id }).returning();
    const rows = await db.update(findings).set({ status: "UNRESOLVED", finding: "Evidence remains unavailable" }).where(eq(findings.caseId, c.id)).returning();
    await db.insert(findingEvidence).values(rows.map(finding => ({ findingId: finding.id, evidenceId: source.id })));
    await db.update(cases).set({ status: "AWAITING_HUMAN_QC", outcome: "INSUFFICIENT_EVIDENCE", outcomeSummary: "Documented gaps remain", commissioningAuthorityConfirmed: true, analystId: admin.id }).where(eq(cases.id, c.id));
    const [before] = await db.select().from(cases).where(eq(cases.id, c.id));
    const checklist = Object.fromEntries(QC_CHECKLIST.map(item => [`qc_${item.key}`, "true"]));
    await Promise.all([
      asUser(first, () => reviewAction(fd({ caseId: c.id, caseVersion: String(before.version), result: "PASS", ...checklist }))),
      asUser(admin, () => updateFindingAction(fd({ caseId: c.id, findingId: rows[0].id, critical: rows[0].critical ? "true" : "false", finding: "Gap reviewed again", status: "UNRESOLVED", evidenceIds: source.id }))),
    ]);
    const [after] = await db.select().from(cases).where(eq(cases.id, c.id));
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.version).toBe(before.version + 1);
    expect(await asUser(first, () => releaseAction(fd({ caseId: c.id })))).toContain("err=");

    await db.update(cases).set({ status: "AWAITING_HUMAN_QC" }).where(eq(cases.id, c.id));
    expect(await asUser(first, () => reviewAction(fd({ caseId: c.id, caseVersion: String(after.version), result: "PASS", ...checklist })))).toContain("ok=");
    const releases = await Promise.all([first, second].map(user => asUser(user, () => releaseAction(fd({ caseId: c.id })))));
    expect(releases.filter(url => url.includes("ok="))).toHaveLength(1);
    expect(releases.filter(url => url.includes("err="))).toHaveLength(1);
    expect(await db.select().from(reports).where(eq(reports.caseId, c.id))).toHaveLength(1);
  }, 30_000);

  it("bounds enrolment signatures to the user, session version and five-minute expiry", async () => {
    const setup = await newMfaSetup(admin.id, admin.email, admin.sessionVersion);
    expect(verifySetupSignature(admin.id, admin.sessionVersion, setup.secret, setup.expires, setup.sig)).toBe(true);
    expect(verifySetupSignature(admin.id, admin.sessionVersion + 1, setup.secret, setup.expires, setup.sig)).toBe(false);
    expect(verifySetupSignature(admin.id, admin.sessionVersion, setup.secret, Date.now() - 1, setup.sig)).toBe(false);
    expect(verifySetupSignature("different-user", admin.sessionVersion, setup.secret, setup.expires, setup.sig)).toBe(false);
  });

  it("invalidates old sessions and enrolment forms after MFA setup", async () => {
    await startSession(admin, false);
    const oldCookie = jar.get("kct_session")!;
    const setup = await newMfaSetup(admin.id, admin.email, admin.sessionVersion);
    const form = fd({ secret: setup.secret, expires: String(setup.expires), sig: setup.sig, code: authenticator.generate(setup.secret) });
    expect(await destination(confirmMfaSetupAction(form))).toContain("ok=");
    const [updated] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(updated.sessionVersion).toBe(admin.sessionVersion + 1);
    const newCookie = jar.get("kct_session")!;
    jar.set("kct_session", oldCookie);
    expect(await getSessionUser()).toBeNull();
    jar.set("kct_session", newCookie);
    expect(await destination(confirmMfaSetupAction(form))).toContain("err=");
    admin = updated;
  }, 30_000);

  it("requires the existing password and factor when moving an authenticator", async () => {
    await startSession(admin, true);
    const setup = await newMfaSetup(admin.id, admin.email, admin.sessionVersion);
    const result = await destination(confirmMfaSetupAction(fd({ secret: setup.secret, expires: String(setup.expires), sig: setup.sig, code: authenticator.generate(setup.secret) })));
    expect(result).toContain("err=");
    const [row] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(row.totpSecretEnc).toBe(admin.totpSecretEnc);
    await startSession(admin, false);
    expect(await destination(confirmMfaSetupAction(fd({ secret: setup.secret, expires: String(setup.expires), sig: setup.sig, code: authenticator.generate(setup.secret) })))).toBe("/login");
  }, 30_000);

  it("clears an existing session before MFA and locks repeated failed codes", async () => {
    await db.update(users).set({ failedMfaAttempts: 0, mfaLockedUntil: null }).where(eq(users.id, admin.id));
    await startSession(admin, true);
    expect(await destination(loginAction(fd({ email: admin.email, password: "first-admin-password" })))).toBe("/login/mfa");
    expect(jar.has("kct_session")).toBe(false);
    for (let i = 0; i < 5; i++) await destination(verifyMfaLoginAction(fd({ code: "invalid" })));
    const [locked] = await db.select().from(users).where(eq(users.id, admin.id));
    expect(locked.mfaLockedUntil!.getTime()).toBeGreaterThan(Date.now());
  }, 30_000);
});

describe("file integrity and freshness", () => {
  it("rejects arbitrary or executable ZIPs renamed as Office documents", () => {
    const arbitrary = Buffer.from(zipSync({ "tool.exe": strToU8("MZ") }));
    expect(checkUpload("invoice.docx", arbitrary).ok).toBe(false);
    expect(checkUpload("invoice.xlsx", arbitrary).ok).toBe(false);
    const real = Buffer.from(zipSync({
      "[Content_Types].xml": strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
      "word/document.xml": strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'),
    }));
    expect(checkUpload("invoice.docx", real).ok).toBe(true);
    expect(checkUpload("invoice.xlsx", real).ok).toBe(false);
    const macro = unzipSync(real);
    macro["word/vbaProject.bin"] = strToU8("macro");
    expect(checkUpload("invoice.docx", Buffer.from(zipSync(macro))).ok).toBe(false);
  });

  it("rejects binary text content after the old 4 KB sample", () => {
    expect(checkUpload("notes.txt", Buffer.concat([Buffer.alloc(5000, 65), Buffer.from([0])])).ok).toBe(false);
    expect(checkUpload("notes.txt", Buffer.from("Real UTF-8 text: Kenya 🇰🇪")).ok).toBe(true);
  });

  it("detects replaced documents and altered report snapshots", () => {
    const bytes = Buffer.from("original source capture");
    const record = { sizeBytes: bytes.length, sha256: sha256(bytes) };
    expect(documentMatches(bytes, record)).toBe(true);
    expect(documentMatches(Buffer.from("changed source capture!"), record)).toBe(false);
    const snapshot = { reference: "KC-2026-0010", outcome: "INSUFFICIENT_EVIDENCE" };
    const hash = sha256(canonicalJson(snapshot));
    expect(reportMatches({ snapshot, sha256: hash })).toBe(true);
    expect(reportMatches({ snapshot: { ...snapshot, outcome: "VERIFIED_WITHIN_SCOPE" }, sha256: hash })).toBe(false);
  });

  it("keeps check dates separate from the date a report is released", () => {
    expect(evidenceDateRange([{ accessResult: "EXAMINED", checkedDate: "2025-02-01" }, { accessResult: "EXAMINED", checkedDate: "2025-02-03" }, { accessResult: "NOT_SUPPLIED", checkedDate: "2026-10-03" }])).toEqual({ oldest: "2025-02-01", newest: "2025-02-03" });
    expect(evidenceDateRange([])).toBeNull();
  });

  it("preserves password spaces and rejects bcrypt truncation", () => {
    expect(passwordStr(fd({ password: " space matters " }), "password")).toBe(" space matters ");
    expect(validPassword("a".repeat(72))).toBe(true);
    expect(validPassword("a".repeat(73))).toBe(false);
    expect(validPassword("😃".repeat(30))).toBe(false);
  });

  it("disables anonymous production setup and accepts only the configured token", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_FIRST_RUN_SETUP", "false");
    vi.stubEnv("SETUP_TOKEN", "");
    expect(firstRunAllowed("")).toBe(false);
    const token = "random-test-only-bootstrap-token-123456";
    vi.stubEnv("SETUP_TOKEN", token);
    expect(firstRunAllowed("wrong-token")).toBe(false);
    expect(firstRunAllowed(token)).toBe(true);
    vi.unstubAllEnvs();
  });
});
