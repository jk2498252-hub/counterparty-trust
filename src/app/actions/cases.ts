"use server";

import { runWorkflow } from "@/lib/transaction";

import { and, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  cases,
  clients,
  counterparties,
  discrepancies,
  documents,
  evidence,
  findingEvidence,
  findings,
  reports,
  representatives,
  reviews,
  timeEntries,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import {
  assertEditable,
  CaseLockedError,
  createFindingRows,
  findingBelongsToCase,
  loadCase,
  nextEvidenceCode,
  nextReference,
  submitInputFor,
  touchCase,
  touchOtherCasesForCounterparty,
} from "@/lib/cases";
import { canonicalJson, sha256 } from "@/lib/crypto";
import { economics } from "@/lib/env";
import { checkUpload, MAX_UPLOAD_BYTES, safeDisplayName } from "@/lib/files";
import { todayNairobi } from "@/lib/format";
import { DISCREPANCY_CODES, LAYER_DEFINITIONS } from "@/lib/layers";
import { back, bool, int, isUuid, optStr, str } from "@/lib/nav";
import { isOutcomeAllowed, type Outcome } from "@/lib/outcome";
import { buildReportData } from "@/lib/report";
import { requireUser } from "@/lib/session";
import { readStoredFile, saveFile } from "@/lib/storage";
import { documentMatches } from "@/lib/integrity";
import { caseSuggestion } from "@/lib/case-readiness";
import { supplierMatches } from "@/lib/supplier-matching";
import {
  canTransition,
  intakeBlockers,
  QC_CHECKLIST,
  releaseBlockers,
  reviewBlockers,
  submitBlockers,
  type CaseStatus,
} from "@/lib/workflow";

const DEPTHS = ["DIGITAL", "ENHANCED", "EXTENDED"] as const;
const FINDING_STATUSES = ["NOT_STARTED", "VERIFIED", "PARTIALLY_VERIFIED", "UNRESOLVED", "CONFLICTING", "NOT_AVAILABLE"] as const;
const CONFIDENCES = ["HIGH", "MEDIUM", "LOW", "NOT_ASSESSED"] as const;
const CATEGORIES = ["AUTHORITATIVE", "FIRST_PARTY", "CLIENT_SUPPLIED", "INDEPENDENT_CONFIRMATION", "THIRD_PARTY", "UNVERIFIED"] as const;
const ACCESS = ["EXAMINED", "ACCESS_REQUIRED", "RETRIEVAL_FAILED", "NOT_SUPPLIED"] as const;
const SEVERITIES = ["CONTEXTUAL", "MINOR", "MATERIAL", "CRITICAL"] as const;
const D_STATES = ["OPEN", "AWAITING_EVIDENCE", "EXPLAINED", "RESOLVED", "ACCEPTED_WITH_LIMITATION", "ESCALATED"] as const;
const OUTCOMES = ["VERIFIED_WITHIN_SCOPE", "VERIFIED_WITH_ISSUES", "INSUFFICIENT_EVIDENCE", "MATERIAL_RED_FLAGS"] as const;
const ACTIVITIES = ["INTAKE", "SOURCE_CHECKS", "ANALYSIS", "CLIENT_COMMS", "REPORT", "QC", "OTHER"] as const;

function pick<T extends readonly string[]>(list: T, v: string, fallback?: T[number]): T[number] {
  if ((list as readonly string[]).includes(v)) return v as T[number];
  if (fallback !== undefined) return fallback;
  throw new Error(`Invalid value: ${v}`);
}

function caseUrl(id: string, tab?: string) {
  return `/cases/${id}${tab ? `?tab=${tab}` : ""}`;
}

function validDate(v: string | null): string | null {
  if (!v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "0001-01-01" && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v ? v : null;
}

function validUrl(v: string | null): string | null {
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Runs an edit, turning a locked-case error into a friendly message. */
async function guarded(caseId: string, tab: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof CaseLockedError) back(caseUrl(caseId, tab), { err: e.message });
    throw e;
  }
}

function caseIdFrom(fd: FormData): string {
  const id = str(fd, "caseId");
  if (!isUuid(id)) throw new Error("Invalid case id");
  return id;
}

// ---------- Create ----------

export async function createCaseAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const depth = pick(DEPTHS, str(fd, "depth"), "DIGITAL");

    // Client: existing or new
    let clientId = str(fd, "clientId");
    if (clientId === "new" || !clientId) {
      const name = str(fd, "clientName");
      if (!name) back("/cases/new", { err: "Enter the client's name or pick an existing client." });
      const [c] = await db
        .insert(clients)
        .values({ name, contactName: optStr(fd, "clientContactName"), contactEmail: optStr(fd, "clientContactEmail") })
        .returning();
      clientId = c.id;
    } else if (!isUuid(clientId)) back("/cases/new", { err: "Invalid client" });

    // Supplier: existing (reuse its profile) or new
    let counterpartyId = str(fd, "counterpartyId");
    if (counterpartyId === "new" || !counterpartyId) {
      const legalName = str(fd, "legalName");
      if (!legalName) back("/cases/new", { err: "Enter the supplier's name or pick an existing supplier." });
      const [cp] = await db
        .insert(counterparties)
        .values({
          legalName,
          registrationNumber: optStr(fd, "registrationNumber"),
          kraPin: optStr(fd, "kraPin")?.toUpperCase() ?? null,
          domain: optStr(fd, "domain")?.toLowerCase() ?? null,
          sector: optStr(fd, "sector"),
        })
        .returning();
      counterpartyId = cp.id;
      const candidates = supplierMatches(cp, await db.select().from(counterparties));
      if (candidates.length) await audit(user.id, "supplier.match_candidates", { supplierId: cp.id, candidates: candidates.map(m => ({ id: m.supplier.id, reasons: m.reasons })) });
    } else if (!isUuid(counterpartyId)) back("/cases/new", { err: "Invalid supplier" });

    const decisionPurpose = str(fd, "decisionPurpose");
    if (!decisionPurpose) back("/cases/new", { err: "Describe the decision this review supports." });

    const reference = await nextReference();
    const [c] = await db
      .insert(cases)
      .values({
        reference,
        clientId,
        counterpartyId,
        depth,
        decisionPurpose,
        decisionOwner: optStr(fd, "decisionOwner"),
        goodsServices: optStr(fd, "goodsServices"),
        amount: optStr(fd, "amount")?.replace(/[, ]/g, "") ?? null,
        currency: (optStr(fd, "currency") ?? "KES").toUpperCase().slice(0, 3),
        expectedPaymentDate: validDate(optStr(fd, "expectedPaymentDate")),
        feeKes: int(fd, "feeKes") ?? economics.prices[depth],
        analystId: user.role === "REVIEWER" ? null : user.id,
        createdById: user.id,
      })
      .returning();
    await createFindingRows(c.id);
    await audit(user.id, "case.created", { reference, depth }, c.id);
    redirect(caseUrl(c.id, "intake"));
  });
}

// ---------- Intake ----------

export async function updateIntakeAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    await guarded(caseId, "intake", async () => {
      await assertEditable(caseId);
      const [c] = await db.select().from(cases).where(eq(cases.id, caseId));
      const depth = pick(DEPTHS, str(fd, "depth"), c.depth);
      await db
        .update(cases)
        .set({
          depth,
          decisionPurpose: str(fd, "decisionPurpose") || c.decisionPurpose,
          decisionOwner: optStr(fd, "decisionOwner"),
          requesterName: optStr(fd, "requesterName"),
          requesterEmail: optStr(fd, "requesterEmail"),
          goodsServices: optStr(fd, "goodsServices"),
          amount: optStr(fd, "amount")?.replace(/[, ]/g, "") ?? null,
          currency: (optStr(fd, "currency") ?? "KES").toUpperCase().slice(0, 3),
          expectedPaymentDate: validDate(optStr(fd, "expectedPaymentDate")),
          isNewSupplier: bool(fd, "isNewSupplier"),
          permittedContacts: optStr(fd, "permittedContacts"),
          commissioningAuthorityConfirmed: bool(fd, "commissioningAuthorityConfirmed"),
          lawfulBasisNote: optStr(fd, "lawfulBasisNote"),
          exclusions: optStr(fd, "exclusions"),
          feeKes: int(fd, "feeKes"),
          directCostsKes: int(fd, "directCostsKes") ?? 0,
        })
        .where(eq(cases.id, caseId));
      await db
        .update(counterparties)
        .set({
          legalName: str(fd, "legalName") || undefined,
          entityType: optStr(fd, "entityType"),
          registrationNumber: optStr(fd, "registrationNumber"),
          registrationAuthority: optStr(fd, "registrationAuthority"),
          kraPin: optStr(fd, "kraPin")?.toUpperCase() ?? null,
          tradingNames: optStr(fd, "tradingNames"),
          domain: optStr(fd, "domain")?.toLowerCase() ?? null,
          registeredAddress: optStr(fd, "registeredAddress"),
          operatingAddress: optStr(fd, "operatingAddress"),
          sector: optStr(fd, "sector"),
          updatedAt: new Date(),
        })
        .where(eq(counterparties.id, c.counterpartyId));
      await touchCase(caseId, user.id, "intake");
      // Supplier details are shared, so other open cases for this supplier must be re-reviewed too.
      await touchOtherCasesForCounterparty(c.counterpartyId, caseId, user.id, `supplier details changed in ${c.reference}`);
    });
    back(caseUrl(caseId, "intake"), { ok: "Intake saved." });
  });
}

export async function addRepresentativeAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const name = str(fd, "name");
    if (!name) back(caseUrl(caseId, "intake"), { err: "Enter the representative's name." });
    await guarded(caseId, "intake", async () => {
      await assertEditable(caseId);
      await db.insert(representatives).values({
        caseId,
        name,
        claimedRole: optStr(fd, "claimedRole"),
        email: optStr(fd, "email"),
        phone: optStr(fd, "phone"),
        howIntroduced: optStr(fd, "howIntroduced"),
        mandateEvidence: optStr(fd, "mandateEvidence"),
      });
      await touchCase(caseId, user.id, "representative added");
    });
    back(caseUrl(caseId, "intake"), { ok: "Representative added." });
  });
}

export async function deleteRepresentativeAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const id = str(fd, "id");
    if (!isUuid(id)) back(caseUrl(caseId, "intake"), { err: "Invalid representative" });
    await guarded(caseId, "intake", async () => {
      await assertEditable(caseId);
      await db.delete(representatives).where(and(eq(representatives.id, id), eq(representatives.caseId, caseId)));
      await touchCase(caseId, user.id, "representative removed");
    });
    back(caseUrl(caseId, "intake"), { ok: "Representative removed." });
  });
}

export async function assignAnalystAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser({ roles: ["ADMIN", "ANALYST"] });
    const caseId = caseIdFrom(fd);
    const analystId = str(fd, "analystId");
    if (!isUuid(analystId)) back(caseUrl(caseId), { err: "Pick an analyst." });
    await guarded(caseId, "overview", async () => {
      await assertEditable(caseId);
      await db.update(cases).set({ analystId }).where(eq(cases.id, caseId));
      await touchCase(caseId, user.id, "analyst assigned");
    });
    back(caseUrl(caseId), { ok: "Analyst assigned." });
  });
}

// ---------- Status changes ----------

export async function changeStatusAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const to = str(fd, "to") as CaseStatus;
    const c = await loadCase(caseId);
    if (!c) back("/cases", { err: "Case not found" });
    const from = c.status as CaseStatus;
    if (!canTransition(from, to)) back(caseUrl(caseId), { err: `Cannot move from ${from} to ${to}.` });

    if (to === "INTAKE_COMPLETE") {
      const blockers = intakeBlockers({
        decisionPurpose: c.decisionPurpose,
        counterpartyName: c.counterparty.legalName,
        clientName: c.client.name,
        commissioningAuthorityConfirmed: c.commissioningAuthorityConfirmed,
      });
      if (blockers.length) back(caseUrl(caseId, "intake"), { err: `Intake is not complete:\n${blockers.join("\n")}` });
    }

    if (to === "AWAITING_HUMAN_QC") {
      if (user.id !== c.analystId && user.role !== "ADMIN") back(caseUrl(caseId), { err: "Only the assigned analyst can send this case for review." });
      const blockers = [...submitBlockers(submitInputFor(c)), ...await captureBlockers(c)];
      if (blockers.length) back(caseUrl(caseId, "outcome"), { err: `Not ready for review:\n${blockers.join("\n")}` });
    }

    if (to === "CANCELLED" || to === "CLOSED") {
      if (user.role === "REVIEWER" && to === "CANCELLED") back(caseUrl(caseId), { err: "Ask the analyst or an admin to cancel a case." });
    }

    if (to === "IN_PROGRESS" && from === "RELEASED") {
      // Correction: the released report stays on record; a new version will need review and release.
      await db.update(cases).set({ status: "IN_PROGRESS", version: c.version + 1, updatedAt: new Date() }).where(eq(cases.id, caseId));
      await audit(user.id, "case.correction_opened", { reason: optStr(fd, "reason") }, caseId);
      back(caseUrl(caseId), { ok: "Correction opened. The released report stays on record; the new version needs review again." });
    }

    // Leaving review (e.g. reviewer sends it back) is handled by the review action.
    if (from === "AWAITING_HUMAN_QC" || from === "READY_TO_RELEASE") {
      if (to === "READY_TO_RELEASE" || to === "RELEASED") back(caseUrl(caseId), { err: "Use the review and release steps." });
    }
    if (to === "RELEASED") back(caseUrl(caseId), { err: "Use the release step." });

    await db.update(cases).set({ status: to, updatedAt: new Date() }).where(eq(cases.id, caseId));
    await audit(user.id, "case.status", { from, to, reason: optStr(fd, "reason") }, caseId);
    back(caseUrl(caseId), { ok: "Status updated." });
  });
}

// ---------- Findings ----------

export async function updateFindingAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const findingId = str(fd, "findingId");
    if (!isUuid(findingId) || !(await findingBelongsToCase(findingId, caseId))) back(caseUrl(caseId, "checks"), { err: "Invalid finding" });

    const [current] = await db.select().from(findings).where(eq(findings.id, findingId));
    const critical = bool(fd, "critical");
    const scopeChangeNote = optStr(fd, "scopeChangeNote");
    const defaultCritical = LAYER_DEFINITIONS[current.layer].criticalByDefault;
    if (defaultCritical && !critical && !scopeChangeNote) {
      back(caseUrl(caseId, "checks") + `#${current.layer}`, {
        err: "This layer is critical by default. To narrow the scope, record the client's agreement in the scope note.",
      });
    }

    const evidenceIds = fd.getAll("evidenceIds").filter((v): v is string => typeof v === "string" && isUuid(v));
    await guarded(caseId, "checks", async () => {
      await assertEditable(caseId);
      // Only link evidence from this same case.
      const valid = evidenceIds.length
        ? await db.select({ id: evidence.id }).from(evidence).where(and(eq(evidence.caseId, caseId), inArray(evidence.id, evidenceIds)))
        : [];
      await db
        .update(findings)
        .set({
          status: pick(FINDING_STATUSES, str(fd, "status"), "NOT_STARTED"),
          confidence: pick(CONFIDENCES, str(fd, "confidence"), "NOT_ASSESSED"),
          finding: optStr(fd, "finding"),
          critical,
          scopeChangeNote: critical === defaultCritical ? null : scopeChangeNote,
          updatedById: user.id,
          updatedAt: new Date(),
        })
        .where(eq(findings.id, findingId));
      await db.delete(findingEvidence).where(eq(findingEvidence.findingId, findingId));
      if (valid.length) await db.insert(findingEvidence).values(valid.map((v) => ({ findingId, evidenceId: v.id })));
      await touchCase(caseId, user.id, `finding ${current.layer}`);
    });
    back(caseUrl(caseId, "checks") + `#${current.layer}`, { ok: `${LAYER_DEFINITIONS[current.layer].title} saved.` });
  });
}

// ---------- Documents & evidence ----------

type UploadResult = { ok: false; error: string } | { ok: true; doc: typeof documents.$inferSelect };

async function storeUpload(
  file: File,
  caseId: string,
  userId: string,
  docType: string,
  source: string | null,
  receivedDate: string | null,
): Promise<UploadResult> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File is larger than 15 MB" };
  const bytes = Buffer.from(await file.arrayBuffer());
  const check = checkUpload(file.name, bytes);
  if (!check.ok) return { ok: false, error: check.reason };
  const storedName = await saveFile(bytes, check.ext);
  const [doc] = await db
    .insert(documents)
    .values({
      caseId,
      originalName: safeDisplayName(file.name),
      storedName,
      mimeType: check.mime,
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
      docType,
      source,
      receivedDate,
      uploadedById: userId,
    })
    .returning();
  return { ok: true, doc };
}

async function captureBlockers(c: NonNullable<Awaited<ReturnType<typeof loadCase>>>) {
  const referenced = new Set(c.evidence.map((e) => e.documentId).filter(Boolean));
  const blockers: string[] = [];
  for (const doc of c.documents.filter((d) => referenced.has(d.id))) {
    const bytes = await readStoredFile(doc.storedName).catch(() => null);
    if (!bytes || !documentMatches(bytes, doc)) blockers.push(`Source capture ${doc.originalName} is missing or failed its integrity check.`);
  }
  return blockers;
}

export async function uploadDocumentAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) back(caseUrl(caseId, "documents"), { err: "Choose a file to upload." });
    let msg = "";
    await guarded(caseId, "documents", async () => {
      await assertEditable(caseId);
      const r = await storeUpload(file, caseId, user.id, str(fd, "docType") || "Other", optStr(fd, "source"), validDate(optStr(fd, "receivedDate")));
      if (!r.ok) {
        msg = r.error;
        return;
      }
      await touchCase(caseId, user.id, `document uploaded (${r.doc.docType})`);
    });
    if (msg) back(caseUrl(caseId, "documents"), { err: msg });
    back(caseUrl(caseId, "documents"), { ok: "Document uploaded." });
  });
}

export async function addEvidenceAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const sourceName = str(fd, "sourceName");
    const summary = str(fd, "summary");
    if (!sourceName || !summary) back(caseUrl(caseId, "evidence"), { err: "Source and summary are required." });
    const rawCheckedDate = optStr(fd, "checkedDate");
    if (rawCheckedDate && !validDate(rawCheckedDate)) back(caseUrl(caseId, "evidence"), { err: "Enter a real source check date." });
    const checkedDate = validDate(rawCheckedDate) ?? todayNairobi();
    if (checkedDate > todayNairobi()) back(caseUrl(caseId, "evidence"), { err: "The source check date cannot be in the future." });
    const validity = validityFrom(fd, checkedDate, caseId);
    const rawUrl = optStr(fd, "url");
    const url = validUrl(rawUrl);
    if (rawUrl && !url) back(caseUrl(caseId, "evidence"), { err: "The link must start with http:// or https://" });

    let err = "";
    await guarded(caseId, "evidence", async () => {
      await assertEditable(caseId);
      let documentId: string | null = null;
      const file = fd.get("file");
      if (file instanceof File && file.size > 0) {
        const r = await storeUpload(file, caseId, user.id, "Source capture", sourceName, checkedDate);
        if (!r.ok) {
          err = r.error;
          return;
        }
        documentId = r.doc.id;
      } else {
        const docId = str(fd, "documentId");
        if (isUuid(docId)) {
          const [d] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, docId), eq(documents.caseId, caseId)));
          documentId = d?.id ?? null;
        }
      }
      await db.insert(evidence).values({
        caseId,
        code: await nextEvidenceCode(caseId),
        sourceName,
        authority: optStr(fd, "authority"),
        category: pick(CATEGORIES, str(fd, "category"), "UNVERIFIED"),
        accessResult: pick(ACCESS, str(fd, "accessResult"), "EXAMINED"),
        url,
        locator: optStr(fd, "locator"),
        checkedDate,
        ...validity,
        summary,
        confidence: pick(CONFIDENCES, str(fd, "confidence"), "NOT_ASSESSED"),
        rightsNote: optStr(fd, "rightsNote"),
        documentId,
        createdById: user.id,
      });
      await touchCase(caseId, user.id, "evidence added");
    });
    if (err) back(caseUrl(caseId, "evidence"), { err });
    back(caseUrl(caseId, "evidence"), { ok: "Evidence logged." });
  });
}

function validityFrom(fd: FormData, checkedDate: string, caseId: string) {
  const validUntilRaw = optStr(fd, "validUntil");
  const recheckRaw = optStr(fd, "recheckOn");
  const validUntil = validDate(validUntilRaw);
  const recheckOn = validDate(recheckRaw);
  const validityNote = optStr(fd, "validityNote");
  if ((validUntilRaw && !validUntil) || (recheckRaw && !recheckOn)) back(caseUrl(caseId, "evidence"), { err: "Enter real dates for source expiry and recheck." });
  if (recheckOn && recheckOn < checkedDate) back(caseUrl(caseId, "evidence"), { err: "Recheck date cannot be before the recorded source check." });
  if ((validUntil || recheckOn) && !validityNote) back(caseUrl(caseId, "evidence"), { err: "Explain the source expiry or the basis for the recheck date." });
  return { validUntil, recheckOn, validityNote };
}

export async function updateEvidenceValidityAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const id = str(fd, "id");
    await guarded(caseId, "evidence", async () => {
      await assertEditable(caseId);
      if (!isUuid(id)) back(caseUrl(caseId, "evidence"), { err: "Invalid evidence" });
      const [source] = await db.select().from(evidence).where(and(eq(evidence.id, id), eq(evidence.caseId, caseId)));
      if (!source) back(caseUrl(caseId, "evidence"), { err: "Evidence not found" });
      const validity = validityFrom(fd, source.checkedDate, caseId);
      await db.update(evidence).set(validity).where(eq(evidence.id, id));
      await touchCase(caseId, user.id, `validity for ${source.code}`);
      await audit(user.id, "evidence.validity_updated", { evidenceId: id, ...validity }, caseId);
    });
    back(caseUrl(caseId, "evidence"), { ok: "Validity saved. Changing it requires a new review." });
  });
}

export async function deleteEvidenceAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const id = str(fd, "id");
    if (!isUuid(id)) back(caseUrl(caseId, "evidence"), { err: "Invalid evidence" });
    await guarded(caseId, "evidence", async () => {
      await assertEditable(caseId);
      const [e] = await db.select().from(evidence).where(and(eq(evidence.id, id), eq(evidence.caseId, caseId)));
      if (!e) return;
      await db.delete(evidence).where(eq(evidence.id, id));
      await touchCase(caseId, user.id, `evidence ${e.code} removed`);
    });
    back(caseUrl(caseId, "evidence"), { ok: "Evidence removed. Findings that cited it have lost that citation." });
  });
}

// ---------- Discrepancies ----------

export async function addDiscrepancyAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const code = str(fd, "code");
    const description = str(fd, "description");
    if (!DISCREPANCY_CODES[code] || !description) back(caseUrl(caseId, "issues"), { err: "Pick an issue type and describe it." });
    await guarded(caseId, "issues", async () => {
      await assertEditable(caseId);
      await db.insert(discrepancies).values({
        caseId,
        code,
        severity: pick(SEVERITIES, str(fd, "severity"), "MINOR"),
        state: "OPEN",
        established: bool(fd, "established"),
        description,
        effect: optStr(fd, "effect"),
        createdById: user.id,
      });
      await touchCase(caseId, user.id, `issue ${code} added`);
    });
    back(caseUrl(caseId, "issues"), { ok: "Issue logged." });
  });
}

export async function updateDiscrepancyAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const id = str(fd, "id");
    if (!isUuid(id)) back(caseUrl(caseId, "issues"), { err: "Invalid issue" });
    const state = pick(D_STATES, str(fd, "state"), "OPEN");
    const explanation = optStr(fd, "explanation");
    if (["EXPLAINED", "RESOLVED", "ACCEPTED_WITH_LIMITATION"].includes(state) && !explanation) {
      back(caseUrl(caseId, "issues"), { err: "Record the explanation or resolution before closing an issue." });
    }
    await guarded(caseId, "issues", async () => {
      await assertEditable(caseId);
      await db
        .update(discrepancies)
        .set({
          state,
          severity: pick(SEVERITIES, str(fd, "severity"), "MINOR"),
          established: bool(fd, "established"),
          explanation,
          effect: optStr(fd, "effect"),
          updatedAt: new Date(),
        })
        .where(and(eq(discrepancies.id, id), eq(discrepancies.caseId, caseId)));
      await touchCase(caseId, user.id, "issue updated");
    });
    back(caseUrl(caseId, "issues"), { ok: "Issue updated." });
  });
}

// ---------- Outcome ----------

export async function setOutcomeAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const c = await loadCase(caseId);
    if (!c) back("/cases", { err: "Case not found" });
    const chosen = str(fd, "outcome") ? (pick(OUTCOMES, str(fd, "outcome")) as Outcome) : null;
    const suggestion = caseSuggestion(c);
    if (chosen && !isOutcomeAllowed(chosen, suggestion.outcome)) {
      back(caseUrl(caseId, "outcome"), {
        err: suggestion.outcome
          ? "That outcome is more favourable than the evidence supports. Resolve the open items first."
          : "Assess every layer before choosing an outcome.",
      });
    }
    await guarded(caseId, "outcome", async () => {
      await assertEditable(caseId);
      await db
        .update(cases)
        .set({ outcome: chosen, outcomeSummary: optStr(fd, "outcomeSummary"), nextSteps: optStr(fd, "nextSteps") })
        .where(eq(cases.id, caseId));
      await touchCase(caseId, user.id, "outcome");
    });
    back(caseUrl(caseId, "outcome"), { ok: "Outcome saved." });
  });
}

// ---------- Review & release ----------

export async function reviewAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser({ roles: ["ADMIN", "REVIEWER"] });
    const caseId = caseIdFrom(fd);
    const c = await loadCase(caseId);
    if (!c) back("/cases", { err: "Case not found" });
    if (c.status !== "AWAITING_HUMAN_QC") back(caseUrl(caseId, "review"), { err: "This case is not waiting for review." });
    const blockers = reviewBlockers({
      reviewerId: user.id,
      analystId: c.analystId,
      reviewerRole: user.role,
      reviewerAuthoredContent: c.authorIds.includes(user.id),
    });
    if (blockers.length) back(caseUrl(caseId, "review"), { err: blockers.join("\n") });

    const reviewedVersion = Number(str(fd, "caseVersion"));
    if (reviewedVersion !== c.version) back(caseUrl(caseId, "review"), { err: "The case changed while you were reviewing. Reload and review again." });

    const checklist = Object.fromEntries(QC_CHECKLIST.map((q) => [q.key, bool(fd, `qc_${q.key}`)]));
    const result = str(fd, "result") === "PASS" ? "PASS" : "FAIL";
    const defects = optStr(fd, "defects");
    if (result === "PASS" && Object.values(checklist).some((v) => !v)) {
      back(caseUrl(caseId, "review"), { err: "Tick every checklist item to pass, or return the case with the defects listed." });
    }
    if (result === "FAIL" && !defects) back(caseUrl(caseId, "review"), { err: "List the defects the analyst must fix." });
    if (result === "PASS") {
      const currentBlockers = [...submitBlockers(submitInputFor(c)), ...await captureBlockers(c)];
      if (currentBlockers.length) back(caseUrl(caseId, "review"), { err: `Case checks must pass at review time:\n${currentBlockers.join("\n")}` });
    }

    await db.insert(reviews).values({ caseId, reviewerId: user.id, caseVersion: c.version, result, checklist, defects });
    await db
      .update(cases)
      .set({ status: result === "PASS" ? "READY_TO_RELEASE" : "IN_PROGRESS", updatedAt: new Date() })
      .where(eq(cases.id, caseId));
    await audit(user.id, `case.review_${result.toLowerCase()}`, { version: c.version, defects }, caseId);
    back(caseUrl(caseId, "review"), { ok: result === "PASS" ? "Review passed. The report can now be released." : "Returned to the analyst." });
  });
}

export async function releaseAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser({ roles: ["ADMIN", "REVIEWER"] });
    const caseId = caseIdFrom(fd);
    const c = await loadCase(caseId);
    if (!c) back("/cases", { err: "Case not found" });
    const latest = c.reviews[0] ?? null;
    const blockers = releaseBlockers({
      status: c.status as CaseStatus,
      caseVersion: c.version,
      analystId: c.analystId,
      releaserId: user.id,
      releaserRole: user.role,
      latestReview: latest ? { result: latest.result, caseVersion: latest.caseVersion, reviewerId: latest.reviewerId } : null,
      releaserAuthoredContent: c.authorIds.includes(user.id),
      contentBlockers: [...submitBlockers(submitInputFor(c)), ...await captureBlockers(c)],
    });
    if (blockers.length) back(caseUrl(caseId, "review"), { err: blockers.join("\n") });

    const data = buildReportData(c, todayNairobi());
    const hash = sha256(canonicalJson(data));
    await db.insert(reports).values({ caseId, caseVersion: c.version, snapshot: data, sha256: hash, releasedById: user.id, reviewId: latest!.id });
    await db.update(cases).set({ status: "RELEASED", releasedAt: new Date(), updatedAt: new Date() }).where(eq(cases.id, caseId));
    await audit(user.id, "case.released", { version: c.version, sha256: hash }, caseId);
    back(caseUrl(caseId, "review"), { ok: `Report released. Fingerprint (SHA-256): ${hash.slice(0, 16)}…` });
  });
}

// ---------- Time ----------

export async function addTimeAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const h = Number(str(fd, "hours") || 0);
    const m = Number(str(fd, "minutes") || 0);
    const minutes = Math.round(h * 60 + m);
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 16 * 60) back(caseUrl(caseId, "time"), { err: "Enter time between 1 minute and 16 hours." });
    await db.insert(timeEntries).values({
      caseId,
      userId: user.id,
      minutes,
      activity: pick(ACTIVITIES, str(fd, "activity"), "ANALYSIS"),
      workDate: validDate(optStr(fd, "workDate")) ?? todayNairobi(),
      note: optStr(fd, "note"),
    });
    await audit(user.id, "time.logged", { minutes }, caseId);
    back(caseUrl(caseId, "time"), { ok: "Time logged." });
  });
}

export async function deleteTimeAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const caseId = caseIdFrom(fd);
    const id = str(fd, "id");
    if (!isUuid(id)) back(caseUrl(caseId, "time"), { err: "Invalid entry" });
    const [t] = await db.select().from(timeEntries).where(and(eq(timeEntries.id, id), eq(timeEntries.caseId, caseId)));
    if (!t) back(caseUrl(caseId, "time"), { err: "Entry not found" });
    if (t.userId !== user.id && user.role !== "ADMIN") back(caseUrl(caseId, "time"), { err: "You can only remove your own time entries." });
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
    await audit(user.id, "time.removed", { minutes: t.minutes }, caseId);
    back(caseUrl(caseId, "time"), { ok: "Entry removed." });
  });
}
