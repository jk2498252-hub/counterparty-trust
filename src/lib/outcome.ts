// Outcome engine: suggests the strongest outcome the evidence allows.
// It never scores a company. It applies the precedence rules in the
// Verification Outcome Standard and the Analyst Decision Tree.

export type FindingStatus =
  | "NOT_STARTED"
  | "VERIFIED"
  | "PARTIALLY_VERIFIED"
  | "UNRESOLVED"
  | "CONFLICTING"
  | "NOT_AVAILABLE";

export type Outcome =
  | "VERIFIED_WITHIN_SCOPE"
  | "VERIFIED_WITH_ISSUES"
  | "INSUFFICIENT_EVIDENCE"
  | "MATERIAL_RED_FLAGS";

export type Severity = "CONTEXTUAL" | "MINOR" | "MATERIAL" | "CRITICAL";
export type DiscrepancyState =
  | "OPEN"
  | "AWAITING_EVIDENCE"
  | "EXPLAINED"
  | "RESOLVED"
  | "ACCEPTED_WITH_LIMITATION"
  | "ESCALATED";

export interface FindingInput {
  layer: string;
  status: FindingStatus;
  critical: boolean;
}

export interface DiscrepancyInput {
  code: string;
  severity: Severity;
  state: DiscrepancyState;
  established: boolean;
  description?: string;
}

export interface OutcomeSuggestion {
  outcome: Outcome | null; // null = not every layer has been assessed yet
  reasons: string[];
}

/** Higher = more favourable to the counterparty. */
export const OUTCOME_RANK: Record<Outcome, number> = {
  MATERIAL_RED_FLAGS: 0,
  INSUFFICIENT_EVIDENCE: 1,
  VERIFIED_WITH_ISSUES: 2,
  VERIFIED_WITHIN_SCOPE: 3,
};

const OPEN_STATES: DiscrepancyState[] = ["OPEN", "AWAITING_EVIDENCE", "ESCALATED"];
const SETTLED_STATES: DiscrepancyState[] = ["EXPLAINED", "RESOLVED"];

export function suggestOutcome(findings: FindingInput[], discrepancies: DiscrepancyInput[]): OutcomeSuggestion {
  const notStarted = findings.filter((f) => f.status === "NOT_STARTED");
  if (findings.length === 0 || notStarted.length > 0) {
    return {
      outcome: null,
      reasons: [`${notStarted.length || "All"} layer(s) not yet assessed: ${notStarted.map((f) => f.layer).join(", ")}`],
    };
  }

  // 1. Established, unresolved material contradictions take precedence.
  const redFlagReasons: string[] = [];
  for (const d of discrepancies) {
    if (d.established && (d.severity === "MATERIAL" || d.severity === "CRITICAL") && OPEN_STATES.includes(d.state)) {
      redFlagReasons.push(`${d.code}: established ${d.severity.toLowerCase()} discrepancy is unresolved`);
    }
  }
  for (const f of findings) {
    if (f.critical && f.status === "CONFLICTING") {
      redFlagReasons.push(`${f.layer}: evidence conflicts on a critical claim`);
    }
  }
  if (redFlagReasons.length) return { outcome: "MATERIAL_RED_FLAGS", reasons: redFlagReasons };

  // 2. Any critical claim not fully established means insufficient evidence.
  const insufficientReasons: string[] = [];
  for (const f of findings) {
    if (f.critical && f.status !== "VERIFIED") {
      insufficientReasons.push(`${f.layer}: critical claim is ${f.status.toLowerCase().replace(/_/g, " ")}`);
    }
  }
  for (const d of discrepancies) {
    const critical = d.severity === "CRITICAL";
    // A critical candidate that is still open, or "accepted with limitation", cannot become a positive result.
    if (critical && !SETTLED_STATES.includes(d.state)) {
      insufficientReasons.push(`${d.code}: critical issue is ${d.state.toLowerCase().replace(/_/g, " ")}`);
    }
    // A material candidate (not yet established) still blocks a positive result.
    if (!critical && d.severity === "MATERIAL" && !d.established && OPEN_STATES.includes(d.state)) {
      insufficientReasons.push(`${d.code}: material candidate issue still open`);
    }
  }
  if (insufficientReasons.length) return { outcome: "INSUFFICIENT_EVIDENCE", reasons: insufficientReasons };

  // 3. Critical claims established but non-critical gaps or issues remain.
  const issueReasons: string[] = [];
  for (const f of findings) {
    if (!f.critical && f.status !== "VERIFIED") {
      issueReasons.push(`${f.layer}: non-critical claim is ${f.status.toLowerCase().replace(/_/g, " ")}`);
    }
  }
  for (const d of discrepancies) {
    if (!SETTLED_STATES.includes(d.state)) {
      issueReasons.push(`${d.code}: ${d.severity.toLowerCase()} issue is ${d.state.toLowerCase().replace(/_/g, " ")}`);
    }
  }
  if (issueReasons.length) return { outcome: "VERIFIED_WITH_ISSUES", reasons: issueReasons };

  return { outcome: "VERIFIED_WITHIN_SCOPE", reasons: ["All checked claims are verified with no open issues"] };
}

/** The analyst may choose the suggested outcome or a less favourable one, never a more favourable one. */
export function isOutcomeAllowed(chosen: Outcome, suggested: Outcome | null): boolean {
  if (suggested === null) return false;
  return OUTCOME_RANK[chosen] <= OUTCOME_RANK[suggested];
}
