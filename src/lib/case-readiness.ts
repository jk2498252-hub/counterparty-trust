import type { LoadedCase } from "./cases";
import { eligibleEvidenceIds, evidenceDecisionFindings } from "./evidence-policy";
import { todayNairobi } from "./format";
import { LAYER_DEFINITIONS } from "./layers";
import { suggestOutcome, type FindingStatus } from "./outcome";
import { submitBlockers, type SubmitInput } from "./workflow";

export type ReadinessCase = Pick<LoadedCase, "findings" | "evidence" | "discrepancies" | "outcome" | "outcomeSummary" | "commissioningAuthorityConfirmed" | "analystId" | "payments">;

export function buildSubmitInput(c: ReadinessCase, today = todayNairobi()): SubmitInput {
  const examined = new Set(c.evidence.filter(e => e.accessResult === "EXAMINED").map(e => e.id));
  const usable = eligibleEvidenceIds(c.evidence, today);
  return {
    findings: c.findings.map(f => ({
      layer: LAYER_DEFINITIONS[f.layer].title, status: f.status, critical: f.critical, finding: f.finding,
      evidenceCount: f.evidenceIds.length, examinedEvidenceCount: f.evidenceIds.filter(id => examined.has(id)).length,
      usableEvidenceCount: f.evidenceIds.filter(id => usable.has(id)).length,
    })),
    discrepancies: c.discrepancies, outcome: c.outcome, outcomeSummary: c.outcomeSummary,
    commissioningAuthorityConfirmed: c.commissioningAuthorityConfirmed, analystId: c.analystId,
    beneficiaryVerifiedWithoutConfirmation: c.findings.some(f => f.layer === "TRANSACTION_BENEFICIARY" && f.status === "VERIFIED") &&
      !c.payments.some(p => p.status === "CONFIRMED_WITHIN_SCOPE"),
  };
}

export function caseSuggestion(c: ReadinessCase, today = todayNairobi()) {
  return suggestOutcome(evidenceDecisionFindings(c.findings, c.evidence, today).map(f => ({
    layer: LAYER_DEFINITIONS[f.layer].title, status: f.status as FindingStatus, critical: f.critical,
  })), c.discrepancies);
}

export function caseReadinessBlockers(c: ReadinessCase, today = todayNairobi()) {
  return submitBlockers(buildSubmitInput(c, today));
}
