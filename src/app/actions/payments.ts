"use server";

import { runWorkflow } from "@/lib/transaction";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { cases, counterparties, paymentApprovals, paymentInstructions } from "@/db/schema";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { paymentApprovalsRequired } from "@/lib/env";
import { back, bool, isUuid, optStr, str } from "@/lib/nav";
import { approvalBlockers, confirmationBlockers, initialStatus, isPending, lastFour, statusAfterApproval, type PaymentStatus } from "@/lib/payments";
import { requireUser } from "@/lib/session";
import { touchCaseIfEditable } from "@/lib/cases";

function idFrom(fd: FormData): string {
  const id = str(fd, "id");
  if (!isUuid(id)) throw new Error("Invalid instruction id");
  return id;
}

const url = (id: string) => `/payments/${id}`;

export async function createInstructionAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const counterpartyId = str(fd, "counterpartyId");
    if (!isUuid(counterpartyId)) back("/payments/new", { err: "Pick the supplier." });
    const [cp] = await db.select({ id: counterparties.id }).from(counterparties).where(eq(counterparties.id, counterpartyId));
    if (!cp) back("/payments/new", { err: "Supplier not found." });

    const caseIdRaw = str(fd, "caseId");
    let caseId: string | null = null;
    if (isUuid(caseIdRaw)) {
      const [c] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.id, caseIdRaw), eq(cases.counterpartyId, counterpartyId)));
      caseId = c?.id ?? null;
    }

    const account = str(fd, "account").replace(/\s+/g, "");
    const beneficiaryName = str(fd, "beneficiaryName");
    const bankName = str(fd, "bankName");
    const sourceDescription = str(fd, "sourceDescription");
    if (!account || account.length < 4 || !beneficiaryName || !bankName || !sourceDescription) {
      back(`/payments/new?counterpartyId=${counterpartyId}`, { err: "Beneficiary, bank, account number and where the instruction came from are required." });
    }

    // Any instruction for a supplier that already has one on file is a change.
    const [existing] = await db
      .select({ id: paymentInstructions.id })
      .from(paymentInstructions)
      .where(and(eq(paymentInstructions.counterpartyId, counterpartyId), eq(paymentInstructions.status, "CONFIRMED_WITHIN_SCOPE")));
    const isChange = bool(fd, "isChange") || !!existing;

    const [p] = await db
      .insert(paymentInstructions)
      .values({
        counterpartyId,
        caseId,
        status: initialStatus(isChange),
        isChange,
        previousInstructionId: existing?.id ?? null,
        beneficiaryName,
        bankName,
        branch: optStr(fd, "branch"),
        accountEnc: encrypt(account),
        accountLast4: lastFour(account),
        currency: (optStr(fd, "currency") ?? "KES").toUpperCase().slice(0, 3),
        sourceDescription,
        requestedEffectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(str(fd, "requestedEffectiveDate")) ? str(fd, "requestedEffectiveDate") : null,
        createdById: user.id,
      })
      .returning();
    await audit(user.id, "payment.logged", { instructionId: p.id, isChange, last4: p.accountLast4 }, caseId);
    if (caseId) await touchCaseIfEditable(caseId, user.id, "bank details logged");
    redirect(url(p.id));
  });
}

export async function recordConfirmationAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const id = idFrom(fd);
    const [p] = await db.select().from(paymentInstructions).where(eq(paymentInstructions.id, id));
    if (!p) back("/payments", { err: "Instruction not found" });
    const input = {
      confirmationChannel: str(fd, "confirmationChannel"),
      channelEstablishedHow: str(fd, "channelEstablishedHow"),
      channelIndependent: bool(fd, "channelIndependent"),
      confirmedWithName: str(fd, "confirmedWithName"),
    };
    const blockers = confirmationBlockers(p.status as PaymentStatus, input);
    if (blockers.length) back(url(id), { err: blockers.join("\n") });

    await db
      .update(paymentInstructions)
      .set({
        ...input,
        confirmedWithRole: optStr(fd, "confirmedWithRole"),
        confirmationNotes: optStr(fd, "confirmationNotes"),
        confirmedAt: new Date(),
        confirmationRecordedById: user.id,
        updatedAt: new Date(),
      })
      .where(eq(paymentInstructions.id, id));
    // A new confirmation replaces any earlier one, so earlier approvals no longer apply.
    await db.delete(paymentApprovals).where(eq(paymentApprovals.instructionId, id));
    await audit(user.id, "payment.confirmation_recorded", { instructionId: id, channel: input.confirmationChannel }, p.caseId);
    if (p.caseId) await touchCaseIfEditable(p.caseId, user.id, "bank confirmation recorded");
    back(url(id), { ok: "Confirmation recorded. Two different people now need to approve it." });
  });
}

export async function approveInstructionAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const id = idFrom(fd);
    const [p] = await db.select().from(paymentInstructions).where(eq(paymentInstructions.id, id));
    if (!p) back("/payments", { err: "Instruction not found" });
    const approvals = await db.select().from(paymentApprovals).where(eq(paymentApprovals.instructionId, id));
    const blockers = approvalBlockers({
      status: p.status as PaymentStatus,
      approverId: user.id,
      createdById: p.createdById,
      confirmationRecordedById: p.confirmationRecordedById,
      hasConfirmation: !!p.confirmedAt && !!p.channelIndependent,
      existingApproverIds: approvals.map((a) => a.userId),
    });
    if (blockers.length) back(url(id), { err: blockers.join("\n") });

    await db.insert(paymentApprovals).values({ instructionId: id, userId: user.id, note: optStr(fd, "note") });
    const next = statusAfterApproval(p.status as PaymentStatus, approvals.length + 1, paymentApprovalsRequired);
    if (next !== p.status) {
      await db.update(paymentInstructions).set({ status: next, updatedAt: new Date() }).where(eq(paymentInstructions.id, id));
      if (p.caseId) await touchCaseIfEditable(p.caseId, user.id, "bank details confirmed", { authored: false });
      if (next === "CONFIRMED_WITHIN_SCOPE") {
        // The earlier confirmed instruction for this supplier is now superseded,
        // so any open case relying on it must be reviewed again.
        const superseded = await db
          .select({ caseId: paymentInstructions.caseId })
          .from(paymentInstructions)
          .where(
            and(
              eq(paymentInstructions.counterpartyId, p.counterpartyId),
              eq(paymentInstructions.status, "CONFIRMED_WITHIN_SCOPE"),
              ne(paymentInstructions.id, id),
            ),
          );
        for (const s of superseded) if (s.caseId) await touchCaseIfEditable(s.caseId, user.id, "earlier bank details superseded", { authored: false });
        await db
          .update(paymentInstructions)
          .set({ status: "SUPERSEDED", updatedAt: new Date() })
          .where(
            and(
              eq(paymentInstructions.counterpartyId, p.counterpartyId),
              eq(paymentInstructions.status, "CONFIRMED_WITHIN_SCOPE"),
              ne(paymentInstructions.id, id),
            ),
          );
      }
    }
    await audit(user.id, "payment.approved", { instructionId: id, approvals: approvals.length + 1, status: next }, p.caseId);
    back(url(id), { ok: next === "CONFIRMED_WITHIN_SCOPE" ? "Confirmed within scope. This is a verification record, not a payment." : "Approval recorded." });
  });
}

export async function rejectInstructionAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser();
    const id = idFrom(fd);
    const note = str(fd, "decisionNote");
    if (!note) back(url(id), { err: "Say why the instruction is rejected." });
    const [p] = await db.select().from(paymentInstructions).where(eq(paymentInstructions.id, id));
    if (!p || !isPending(p.status as PaymentStatus)) back(url(id), { err: "Only a pending instruction can be rejected." });
    await db.update(paymentInstructions).set({ status: "REJECTED", decisionNote: note, updatedAt: new Date() }).where(eq(paymentInstructions.id, id));
    await audit(user.id, "payment.rejected", { instructionId: id }, p.caseId);
    if (p.caseId) await touchCaseIfEditable(p.caseId, user.id, "bank details rejected", { authored: false });
    back(url(id), { ok: "Instruction rejected." });
  });
}

export async function revokeInstructionAction(fd: FormData) {
  return runWorkflow(async () => {
    const user = await requireUser({ roles: ["ADMIN", "REVIEWER"] });
    const id = idFrom(fd);
    const note = str(fd, "decisionNote");
    if (!note) back(url(id), { err: "Say why the confirmation is revoked." });
    const [p] = await db.select().from(paymentInstructions).where(eq(paymentInstructions.id, id));
    if (!p || p.status !== "CONFIRMED_WITHIN_SCOPE") back(url(id), { err: "Only a confirmed instruction can be revoked." });
    await db.update(paymentInstructions).set({ status: "REVOKED", decisionNote: note, updatedAt: new Date() }).where(eq(paymentInstructions.id, id));
    await audit(user.id, "payment.revoked", { instructionId: id }, p.caseId);
    if (p.caseId) await touchCaseIfEditable(p.caseId, user.id, "bank confirmation revoked", { authored: false });
    back(url(id), { ok: "Confirmation revoked." });
  });
}
