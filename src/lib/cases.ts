import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  cases,
  clients,
  counterparties,
  discrepancies,
  documents,
  evidence,
  findingEvidence,
  findings,
  paymentInstructions,
  representatives,
  reports,
  reviews,
  timeEntries,
  users,
} from "@/db/schema";
import { LAYERS, LAYER_DEFINITIONS } from "./layers";
import { editInvalidatesReview, isEditable, type CaseStatus } from "./workflow";
import { audit } from "./audit";

export async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(cases)
    .where(sql`${cases.reference} like ${`KC-${year}-%`}`);
  return `KC-${year}-${String(n + 1).padStart(4, "0")}`;
}

export async function createFindingRows(caseId: string) {
  await db.insert(findings).values(
    LAYERS.map((layer) => ({ caseId, layer, critical: LAYER_DEFINITIONS[layer].criticalByDefault })),
  );
}

export async function loadCase(id: string) {
  const [row] = await db
    .select({ c: cases, client: clients, cp: counterparties })
    .from(cases)
    .innerJoin(clients, eq(cases.clientId, clients.id))
    .innerJoin(counterparties, eq(cases.counterpartyId, counterparties.id))
    .where(eq(cases.id, id));
  if (!row) return null;

  const [fRows, eRows, dRows, repRows, docRows, revRows, timeRows, payRows, reportRows, userRows] = await Promise.all([
    db.select().from(findings).where(eq(findings.caseId, id)),
    db.select().from(evidence).where(eq(evidence.caseId, id)).orderBy(asc(evidence.code)),
    db.select().from(discrepancies).where(eq(discrepancies.caseId, id)).orderBy(asc(discrepancies.createdAt)),
    db.select().from(representatives).where(eq(representatives.caseId, id)).orderBy(asc(representatives.createdAt)),
    db.select().from(documents).where(eq(documents.caseId, id)).orderBy(desc(documents.createdAt)),
    db.select().from(reviews).where(eq(reviews.caseId, id)).orderBy(desc(reviews.createdAt)),
    db.select().from(timeEntries).where(eq(timeEntries.caseId, id)).orderBy(desc(timeEntries.workDate)),
    db.select().from(paymentInstructions).where(eq(paymentInstructions.caseId, id)).orderBy(desc(paymentInstructions.createdAt)),
    db.select().from(reports).where(eq(reports.caseId, id)).orderBy(desc(reports.createdAt)),
    db.select({ id: users.id, name: users.name, role: users.role, active: users.active }).from(users),
  ]);

  const links = fRows.length
    ? await db.select().from(findingEvidence).where(inArray(findingEvidence.findingId, fRows.map((f) => f.id)))
    : [];

  const order = new Map(LAYERS.map((l, i) => [l, i]));
  const findingsWithEvidence = fRows
    .sort((a, b) => (order.get(a.layer) ?? 0) - (order.get(b.layer) ?? 0))
    .map((f) => ({ ...f, evidenceIds: links.filter((l) => l.findingId === f.id).map((l) => l.evidenceId) }));

  const userName = (uid: string | null | undefined) => userRows.find((u) => u.id === uid)?.name ?? "—";

  return {
    ...row.c,
    client: row.client,
    counterparty: row.cp,
    findings: findingsWithEvidence,
    evidence: eRows,
    discrepancies: dRows,
    representatives: repRows,
    documents: docRows,
    reviews: revRows,
    timeEntries: timeRows,
    payments: payRows,
    reports: reportRows,
    users: userRows,
    userName,
  };
}

export type LoadedCase = NonNullable<Awaited<ReturnType<typeof loadCase>>>;

export async function loadAudit(caseId: string) {
  return db
    .select({ e: auditEvents, actor: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorId, users.id))
    .where(eq(auditEvents.caseId, caseId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);
}

export class CaseLockedError extends Error {}

/**
 * Call after every content change to a case. Bumps the version; if the case was
 * waiting for or had passed review, the review no longer applies and the case
 * returns to IN_PROGRESS.
 */
export async function touchCase(caseId: string, actorId: string, what: string) {
  const [c] = await db.select({ status: cases.status, version: cases.version }).from(cases).where(eq(cases.id, caseId));
  if (!c) throw new CaseLockedError("Case not found");
  const status = c.status as CaseStatus;
  if (!isEditable(status)) throw new CaseLockedError("This case is released or closed. Open a correction to change it.");
  const invalidate = editInvalidatesReview(status);
  await db
    .update(cases)
    .set({ version: c.version + 1, updatedAt: new Date(), ...(invalidate ? { status: "IN_PROGRESS" as const } : {}) })
    .where(eq(cases.id, caseId));
  await audit(actorId, "case.changed", { what, version: c.version + 1, reviewInvalidated: invalidate }, caseId);
}

export async function assertEditable(caseId: string) {
  const [c] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, caseId));
  if (!c) throw new CaseLockedError("Case not found");
  if (!isEditable(c.status as CaseStatus)) throw new CaseLockedError("This case is released or closed. Open a correction to change it.");
}

export async function nextEvidenceCode(caseId: string): Promise<string> {
  const rows = await db.select({ code: evidence.code }).from(evidence).where(eq(evidence.caseId, caseId));
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.replace(/\D/g, "")) || 0), 0);
  return `E${String(max + 1).padStart(2, "0")}`;
}

export async function findingBelongsToCase(findingId: string, caseId: string) {
  const [f] = await db.select({ id: findings.id }).from(findings).where(and(eq(findings.id, findingId), eq(findings.caseId, caseId)));
  return !!f;
}
