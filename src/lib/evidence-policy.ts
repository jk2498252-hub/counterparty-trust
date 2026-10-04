import { todayNairobi } from "./format";

export interface EvidencePolicy {
  id: string;
  accessResult: string;
  checkedDate: string;
  validUntil?: string | null;
  recheckOn?: string | null;
  validityNote?: string | null;
}

export type EvidenceState = "CURRENT" | "EXPIRED" | "RECHECK_DUE" | "NOT_SET" | "UNAVAILABLE" | "INVALID";
export const EVIDENCE_STATE_LABELS: Record<EvidenceState, string> = {
  CURRENT: "Current under recorded policy", EXPIRED: "Expired", RECHECK_DUE: "Recheck due",
  NOT_SET: "Validity not set", UNAVAILABLE: "Source unavailable", INVALID: "Invalid validity dates",
};

function isDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= "0001-01-01" && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}

/** Source expiry is inclusive; a chosen recheck is due at the start of that day. */
export function evidenceState(e: EvidencePolicy, today = todayNairobi()): EvidenceState {
  if (e.accessResult !== "EXAMINED") return "UNAVAILABLE";
  if (!isDay(today) || !isDay(e.checkedDate) || e.checkedDate > today ||
      (e.validUntil && !isDay(e.validUntil)) || (e.recheckOn && (!isDay(e.recheckOn) || e.recheckOn < e.checkedDate))) return "INVALID";
  if (e.validUntil && e.validUntil < today) return "EXPIRED";
  if (e.recheckOn && e.recheckOn <= today) return "RECHECK_DUE";
  if ((!e.validUntil && !e.recheckOn) || !e.validityNote?.trim()) return "NOT_SET";
  return "CURRENT";
}

export function evidenceDueDate(e: EvidencePolicy): string | null {
  return [e.validUntil, e.recheckOn].filter((d): d is string => !!d && isDay(d)).sort()[0] ?? null;
}

export function eligibleEvidenceIds(rows: EvidencePolicy[], today = todayNairobi()): Set<string> {
  return new Set(rows.filter(e => evidenceState(e, today) === "CURRENT").map(e => e.id));
}

/** A recorded positive assessment loses positive support when its sources lapse. */
export function evidenceDecisionFindings<T extends { status: string; evidenceIds: string[] }>(findings: T[], rows: EvidencePolicy[], today = todayNairobi()) {
  const usable = eligibleEvidenceIds(rows, today);
  return findings.map(f => ({ ...f, status: (f.status === "VERIFIED" || f.status === "PARTIALLY_VERIFIED") && !f.evidenceIds.some(id => usable.has(id)) ? "UNRESOLVED" : f.status }));
}
