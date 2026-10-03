// Case workflow: allowed status transitions and the gates that guard them.
// Workflow status is separate from the verification outcome.

import { isOutcomeAllowed, suggestOutcome, type DiscrepancyInput, type FindingInput, type Outcome } from "./outcome";

export type CaseStatus =
  | "DRAFT"
  | "INTAKE_COMPLETE"
  | "IN_PROGRESS"
  | "AWAITING_CLIENT"
  | "AWAITING_ACCESS"
  | "AWAITING_HUMAN_QC"
  | "READY_TO_RELEASE"
  | "RELEASED"
  | "CLOSED"
  | "CANCELLED";

export const STATUS_LABELS: Record<CaseStatus, string> = {
  DRAFT: "Draft intake",
  INTAKE_COMPLETE: "Intake complete",
  IN_PROGRESS: "In progress",
  AWAITING_CLIENT: "Waiting on client",
  AWAITING_ACCESS: "Waiting on source access",
  AWAITING_HUMAN_QC: "Waiting for review",
  READY_TO_RELEASE: "Ready to release",
  RELEASED: "Released",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: ["INTAKE_COMPLETE", "CANCELLED"],
  INTAKE_COMPLETE: ["IN_PROGRESS", "DRAFT", "CANCELLED"],
  IN_PROGRESS: ["AWAITING_CLIENT", "AWAITING_ACCESS", "AWAITING_HUMAN_QC", "CANCELLED"],
  AWAITING_CLIENT: ["IN_PROGRESS", "CANCELLED"],
  AWAITING_ACCESS: ["IN_PROGRESS", "CANCELLED"],
  AWAITING_HUMAN_QC: ["READY_TO_RELEASE", "IN_PROGRESS"],
  READY_TO_RELEASE: ["RELEASED", "IN_PROGRESS"],
  RELEASED: ["CLOSED", "IN_PROGRESS"], // IN_PROGRESS = a correction, which creates a new report version
  CLOSED: [],
  CANCELLED: [],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses in which case content can be edited at all. */
export function isEditable(status: CaseStatus): boolean {
  return !["RELEASED", "CLOSED", "CANCELLED"].includes(status);
}

/** Editing content in these statuses invalidates the review and sends the case back to IN_PROGRESS. */
export function editInvalidatesReview(status: CaseStatus): boolean {
  return status === "AWAITING_HUMAN_QC" || status === "READY_TO_RELEASE";
}

// ---------- Gates ----------

export interface IntakeInput {
  decisionPurpose: string | null;
  counterpartyName: string | null;
  clientName: string | null;
  commissioningAuthorityConfirmed: boolean;
}

export function intakeBlockers(i: IntakeInput): string[] {
  const out: string[] = [];
  if (!i.clientName?.trim()) out.push("Client is missing");
  if (!i.counterpartyName?.trim()) out.push("Supplier name is missing");
  if (!i.decisionPurpose?.trim()) out.push("The decision this review supports is missing");
  if (!i.commissioningAuthorityConfirmed) out.push("Client's authority to commission the review is not confirmed");
  return out;
}

export interface FindingForGate extends FindingInput {
  finding: string | null;
  evidenceCount: number;
}

export interface SubmitInput {
  findings: FindingForGate[];
  discrepancies: DiscrepancyInput[];
  outcome: Outcome | null;
  outcomeSummary: string | null;
  commissioningAuthorityConfirmed: boolean;
  analystId: string | null;
  /** The transaction/beneficiary layer is marked Verified but no bank details on the case are confirmed. */
  beneficiaryVerifiedWithoutConfirmation?: boolean;
}

/** Everything that must be true before an analyst can send a case to human review. */
export function submitBlockers(i: SubmitInput): string[] {
  const out: string[] = [];
  if (!i.analystId) out.push("No analyst is assigned");
  if (!i.commissioningAuthorityConfirmed) out.push("Client's authority to commission the review is not confirmed");
  for (const f of i.findings) {
    if (f.status === "NOT_STARTED") {
      out.push(`${f.layer}: not assessed`);
      continue;
    }
    if (!f.finding?.trim()) out.push(`${f.layer}: finding text is empty`);
    if (f.evidenceCount < 1) out.push(`${f.layer}: no evidence cited (uncited findings cannot be released)`);
  }
  if (i.beneficiaryVerifiedWithoutConfirmation)
    out.push(
      "Transaction and beneficiary is marked Verified, but no bank details on this case are confirmed. Confirm them under Bank details, or change the result.",
    );
  const suggestion = suggestOutcome(i.findings, i.discrepancies);
  if (!i.outcome) out.push("No outcome selected");
  else if (!isOutcomeAllowed(i.outcome, suggestion.outcome))
    out.push(`Selected outcome is more favourable than the evidence allows (${suggestion.outcome ?? "incomplete"})`);
  if (!i.outcomeSummary?.trim()) out.push("Outcome summary is empty");
  return out;
}

export interface ReviewInput {
  reviewerId: string;
  analystId: string | null;
  reviewerRole: "ADMIN" | "ANALYST" | "REVIEWER";
}

/** Who may review: a reviewer or admin who did not produce the case. */
export function reviewBlockers(i: ReviewInput): string[] {
  const out: string[] = [];
  if (i.reviewerRole === "ANALYST") out.push("Only a reviewer or admin can review a case");
  if (i.reviewerId === i.analystId) out.push("The analyst who produced the case cannot review it");
  return out;
}

export interface ReleaseInput {
  status: CaseStatus;
  caseVersion: number;
  analystId: string | null;
  releaserId: string;
  releaserRole: "ADMIN" | "ANALYST" | "REVIEWER";
  latestReview: { result: "PASS" | "FAIL"; caseVersion: number; reviewerId: string } | null;
}

export function releaseBlockers(i: ReleaseInput): string[] {
  const out: string[] = [];
  if (i.status !== "READY_TO_RELEASE") out.push("Case is not ready to release");
  if (i.releaserRole === "ANALYST") out.push("Only a reviewer or admin can release a report");
  if (i.releaserId === i.analystId) out.push("The analyst cannot release their own case");
  if (!i.latestReview) out.push("No human review recorded");
  else {
    if (i.latestReview.result !== "PASS") out.push("Latest review did not pass");
    if (i.latestReview.caseVersion !== i.caseVersion) out.push("Case changed after review; it must be reviewed again");
    if (i.latestReview.reviewerId === i.analystId) out.push("Review was not independent of the analyst");
  }
  return out;
}

/** The QC checklist a reviewer must tick (from the QC Standard). */
export const QC_CHECKLIST: { key: string; label: string }[] = [
  { key: "entity", label: "Exact intended entity and identifiers match; namesakes and group companies separated" },
  { key: "evidence", label: "Every material claim traces to examined evidence or an explicitly missing check" },
  { key: "dates", label: "Dates, sources, failed retrievals and paid-access gaps are recorded accurately" },
  { key: "tax", label: "KRA PIN / TCC / eTIMS results are current and attributed to the right entity" },
  { key: "authority", label: "Representative role and authority distinguished; independent channel documented" },
  { key: "beneficiary", label: "Contracting entity, invoice issuer and beneficiary relationship explained" },
  { key: "outcome", label: "Outcome follows the stated scope and evidence; no guarantee, score or fraud claim" },
  { key: "limits", label: "What was checked, excluded and unresolved is clear; next steps included" },
  { key: "privacy", label: "Only necessary personal and bank data in the report; recipients authorised" },
  { key: "misread", label: "The client could not mistake this report for payment approval" },
];
