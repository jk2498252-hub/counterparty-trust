import { todayNairobi } from "./format";
import type { Layer } from "./layers";
import { addDays, MAX_VALIDITY_DAYS, NEVER_SUPPORTS, supportGaps } from "./source-rules";

export interface EvidencePolicy {
  id: string;
  accessResult: string;
  checkedDate: string;
  validUntil?: string | null;
  recheckOn?: string | null;
  validityNote?: string | null;
  category?: string;
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
  // A validity running years past the check is a typing mistake, not a policy.
  const latest = addDays(e.checkedDate, MAX_VALIDITY_DAYS);
  if ((e.validUntil && e.validUntil > latest) || (e.recheckOn && e.recheckOn > latest)) return "INVALID";
  if (e.validUntil && e.validUntil < today) return "EXPIRED";
  if (e.recheckOn && e.recheckOn <= today) return "RECHECK_DUE";
  if ((!e.validUntil && !e.recheckOn) || !e.validityNote?.trim()) return "NOT_SET";
  return "CURRENT";
}

export function evidenceDueDate(e: EvidencePolicy): string | null {
  return [e.validUntil, e.recheckOn].filter((d): d is string => !!d && isDay(d)).sort()[0] ?? null;
}

/** Current, examined sources that are allowed to support a positive finding at all. */
export function eligibleEvidenceIds(rows: EvidencePolicy[], today = todayNairobi()): Set<string> {
  return new Set(rows.filter(e => evidenceState(e, today) === "CURRENT" && !(NEVER_SUPPORTS as string[]).includes(e.category ?? "")).map(e => e.id));
}

/** What a positive finding on this layer is still missing, given the sources it cites. */
export function findingSupportGaps(f: { layer: Layer; evidenceIds: string[] }, rows: EvidencePolicy[], today = todayNairobi()): string[] {
  const usable = eligibleEvidenceIds(rows, today);
  const categories = rows.filter(e => usable.has(e.id) && f.evidenceIds.includes(e.id)).map(e => e.category ?? "");
  return supportGaps(f.layer, categories);
}

/**
 * A recorded positive assessment counts as positive only while its cited sources are current
 * and include the kinds of source its check requires; otherwise it counts as unresolved.
 */
export function evidenceDecisionFindings<T extends { layer: Layer; status: string; evidenceIds: string[] }>(findings: T[], rows: EvidencePolicy[], today = todayNairobi()) {
  return findings.map(f => ({
    ...f,
    status: (f.status === "VERIFIED" || f.status === "PARTIALLY_VERIFIED") && findingSupportGaps(f, rows, today).length ? "UNRESOLVED" : f.status,
  }));
}
