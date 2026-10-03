// Bank-detail verification rules (payment integrity workflow).
// This system records verification status only. It never executes payments.

export type PaymentStatus =
  | "PROPOSED_UNVERIFIED"
  | "FROZEN_PENDING_CONFIRMATION"
  | "CONFIRMED_WITHIN_SCOPE"
  | "REJECTED"
  | "SUPERSEDED"
  | "REVOKED";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PROPOSED_UNVERIFIED: "Proposed, unverified",
  FROZEN_PENDING_CONFIRMATION: "Frozen: change pending confirmation",
  CONFIRMED_WITHIN_SCOPE: "Confirmed within scope",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
  REVOKED: "Revoked",
};

export function initialStatus(isChange: boolean): PaymentStatus {
  return isChange ? "FROZEN_PENDING_CONFIRMATION" : "PROPOSED_UNVERIFIED";
}

export function isPending(status: PaymentStatus): boolean {
  return status === "PROPOSED_UNVERIFIED" || status === "FROZEN_PENDING_CONFIRMATION";
}

export interface ConfirmationInput {
  confirmationChannel: string;
  channelEstablishedHow: string;
  channelIndependent: boolean;
  confirmedWithName: string;
}

export function confirmationBlockers(status: PaymentStatus, c: ConfirmationInput): string[] {
  const out: string[] = [];
  if (!isPending(status)) out.push("Only a pending instruction can be confirmed");
  if (!c.confirmationChannel.trim()) out.push("Say which channel was used (e.g. phone call to the number on the CR12)");
  if (!c.channelEstablishedHow.trim()) out.push("Say where the contact details came from");
  if (!c.channelIndependent)
    out.push("The contact must come from an independent, previously trusted source, not from the request itself");
  if (!c.confirmedWithName.trim()) out.push("Name the person who confirmed the details");
  return out;
}

export interface ApprovalCheckInput {
  status: PaymentStatus;
  approverId: string;
  createdById: string;
  confirmationRecordedById: string | null;
  hasConfirmation: boolean;
  existingApproverIds: string[];
}

export function approvalBlockers(i: ApprovalCheckInput): string[] {
  const out: string[] = [];
  if (!isPending(i.status)) out.push("Only a pending instruction can be approved");
  if (!i.hasConfirmation) out.push("Record the independent confirmation before approving");
  if (i.approverId === i.createdById) out.push("The person who logged the instruction cannot approve it");
  if (i.existingApproverIds.includes(i.approverId)) out.push("You have already approved this instruction");
  return out;
}

/** Status after an approval is added. */
export function statusAfterApproval(current: PaymentStatus, approvalCount: number, required: number): PaymentStatus {
  if (!isPending(current)) return current;
  return approvalCount >= required ? "CONFIRMED_WITHIN_SCOPE" : current;
}

export function maskAccount(last4: string): string {
  return `•••• ${last4}`;
}

export function lastFour(account: string): string {
  const clean = account.replace(/\s+/g, "");
  return clean.slice(-4).padStart(4, "•");
}
