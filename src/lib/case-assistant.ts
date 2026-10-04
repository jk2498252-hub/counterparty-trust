import type { LoadedCase } from "./cases";
import { caseReadinessBlockers, caseSuggestion } from "./case-readiness";
import { EVIDENCE_STATE_LABELS, evidenceState, eligibleEvidenceIds } from "./evidence-policy";
import { todayNairobi } from "./format";
import { LAYER_DEFINITIONS, OUTCOME_LABELS } from "./layers";

export type AssistedCase = Pick<LoadedCase, "id" | "reference" | "status" | "version" | "counterparty" | "client" | "decisionPurpose" | "expectedPaymentDate" | "findings" | "evidence" | "discrepancies" | "payments" | "outcome" | "outcomeSummary" | "commissioningAuthorityConfirmed" | "analystId" | "reviews">;
export interface CaseTask { id: string; priority: "urgent" | "action" | "info"; title: string; reason: string; href: string }
const priority = { urgent: 0, action: 1, info: 2 };

/** Explainable rules run from live records; no assessments or approvals are made. */
export function analyseCase(c: AssistedCase, today = todayNairobi()) {
  const tasks: CaseTask[] = [];
  const base = `/cases/${c.id}`;
  const archived = ["RELEASED", "CLOSED", "CANCELLED"].includes(c.status);
  const blockers = archived ? [] : caseReadinessBlockers(c, today);
  const suggestion = caseSuggestion(c, today);
  const usable = eligibleEvidenceIds(c.evidence, today);
  const add = (id: string, level: CaseTask["priority"], title: string, reason: string, tab: string) => tasks.push({ id, priority: level, title, reason, href: `${base}?tab=${tab}` });
  if (!archived) {
    if (!c.commissioningAuthorityConfirmed) add("authority", "action", "Confirm client authority", "Record who authorised this supplier review.", "intake");
    if (!c.analystId) add("analyst", "action", "Assign an analyst", "One named analyst needs to own the case work.", "overview");
    if (c.expectedPaymentDate && c.expectedPaymentDate <= today) add("payment-date", "urgent", "Payment date reached while the review is open", `Recorded payment date: ${c.expectedPaymentDate}. Resolve the review gaps with the decision owner; this app does not approve payment.`, "intake");
    for (const source of c.evidence) {
      const state = evidenceState(source, today);
      if (state === "CURRENT") continue;
      const cited = c.findings.some(f => f.evidenceIds.includes(source.id));
      add(`source-${source.id}`, state === "EXPIRED" || state === "RECHECK_DUE" ? "urgent" : "action",
        `${source.code}: ${EVIDENCE_STATE_LABELS[state].toLowerCase()}`,
        `${source.sourceName}. ${state === "NOT_SET" ? "Record its actual expiry or a justified recheck date before using it for a positive finding." : state === "UNAVAILABLE" ? "Log the access gap or obtain an examined source; missing records do not establish wrongdoing." : "Recheck the source and record what changed before relying on it again."}${cited ? " Cited by the case's findings." : " Not currently cited."}`, `evidence#e-${source.id}`);
    }
    for (const f of c.findings) {
      const title = LAYER_DEFINITIONS[f.layer].title;
      if (f.status === "NOT_STARTED") add(`finding-${f.id}`, "action", `Assess ${title.toLowerCase()}`, LAYER_DEFINITIONS[f.layer].question, `checks#${f.layer}`);
      else if (!f.finding?.trim() || !f.evidenceIds.length) add(`finding-${f.id}`, "action", `Complete ${title.toLowerCase()}`, "Record the finding and cite the sources or documented access gaps it uses.", `checks#${f.layer}`);
      else if ((f.status === "VERIFIED" || f.status === "PARTIALLY_VERIFIED") && !f.evidenceIds.some(id => usable.has(id)))
        add(`finding-${f.id}`, "urgent", `Refresh support for ${title.toLowerCase()}`, "The recorded positive assessment has no current source under a recorded validity policy.", `checks#${f.layer}`);
    }
    for (const issue of c.discrepancies.filter(d => !["EXPLAINED", "RESOLVED"].includes(d.state))) {
      add(`issue-${issue.id}`, issue.severity === "CRITICAL" || issue.severity === "MATERIAL" ? "urgent" : "action",
        `${issue.code}: resolve the ${issue.severity.toLowerCase()} issue`, `${issue.established ? "Recorded as established" : "Candidate issue requiring evidence"}: ${issue.description}`, "issues");
    }
    for (const payment of c.payments.filter(p => ["PROPOSED_UNVERIFIED", "FROZEN_PENDING_CONFIRMATION"].includes(p.status))) {
      tasks.push({ id: `bank-${payment.id}`, priority: "urgent", title: "Confirm bank details independently", reason: `${payment.bankName} •••• ${payment.accountLast4}: obtain confirmation through a separately established contact, then the required independent approvals.`, href: `/payments/${payment.id}` });
    }
    if (!c.outcome || !c.outcomeSummary?.trim()) add("outcome", "action", "Record the outcome and its explanation", "Use the strongest outcome the current evidence permits or a more cautious one.", "outcome");
    if (blockers.some(b => b.startsWith("Selected outcome"))) add("unsupported-outcome", "urgent", "Reconsider the selected outcome", "Current evidence no longer supports the recorded outcome. Resolve the gaps or choose a more cautious result.", "outcome");
    if (c.status === "AWAITING_HUMAN_QC") add("human-review", "action", "Independent review required", "A reviewer who did not produce or edit this case must examine its sources and conclusions.", "review");
    if (c.status === "READY_TO_RELEASE" && !blockers.length) add("release", "info", "Ready for an authorised release decision", "The current content checks pass. An independent reviewer must make the release decision.", "review");
    if (!tasks.length && c.status === "IN_PROGRESS") add("submit", "info", "Ready to send for independent review", "Current case checks pass. The assigned analyst can submit it for review.", "review");
  }
  return { tasks: tasks.sort((a, b) => priority[a.priority] - priority[b.priority] || a.id.localeCompare(b.id)), blockers, suggestion, archived };
}

export function handoverDraft(c: AssistedCase, today = todayNairobi()): string {
  const a = analyseCase(c, today);
  const codes = new Map(c.evidence.map(e => [e.id, e.code]));
  const paragraphs = [
    "INTERNAL HANDOVER DRAFT — check against the cited sources before sharing.",
    `${c.reference}, version ${c.version} · ${c.counterparty.legalName} · client: ${c.client.name}. Prepared ${today}.`,
    `Decision: ${c.decisionPurpose}`,
    `Recorded outcome: ${c.outcome ? OUTCOME_LABELS[c.outcome] : "Not selected"}. ${a.archived ? "This is a historical case; use the frozen released report for its issued conclusion." : `Current rule-based suggestion: ${a.suggestion.outcome ? OUTCOME_LABELS[a.suggestion.outcome] : "Assessment incomplete"}.`}`,
    "Recorded assessments:",
    ...c.findings.map(f => `${LAYER_DEFINITIONS[f.layer].title}: ${f.finding || "Not recorded"} [${f.evidenceIds.map(id => codes.get(id)).filter(Boolean).join(", ") || "no citation"}].`),
    "Source register:",
    ...c.evidence.map(e => `[${e.code}] ${e.sourceName}, checked ${e.checkedDate}; ${EVIDENCE_STATE_LABELS[evidenceState(e, today)]}. ${e.summary}`),
    "Recorded issues:",
    ...c.discrepancies.map(d => `${d.code} (${d.established ? "established" : "candidate"}, ${d.state.toLowerCase()}): ${d.description}`),
    ...(a.archived ? [] : ["Next actions:", ...a.tasks.map(t => `${t.title}: ${t.reason}`)]),
    "This draft does not verify an entity, approve payment or replace independent review.",
  ];
  return paragraphs.join("\n\n");
}
