import type { Case, Evidence, Finding } from "@/db/schema";
import type { CaseTask } from "./case-assistant";
import { EVIDENCE_STATE_LABELS, evidenceDueDate, evidenceState } from "./evidence-policy";
import { todayNairobi } from "./format";

type QueueCase = Pick<Case, "id" | "reference" | "status" | "analystId" | "expectedPaymentDate">;
type QueueEvidence = Pick<Evidence, "id" | "caseId" | "code" | "sourceName" | "checkedDate" | "accessResult" | "validUntil" | "recheckOn" | "validityNote">;
type QueueFinding = Pick<Finding, "caseId" | "status">;

export function attentionQueue(cases: QueueCase[], evidence: QueueEvidence[], findings: QueueFinding[], today = todayNairobi()): CaseTask[] {
  const open = cases.filter(c => !["RELEASED", "CLOSED", "CANCELLED"].includes(c.status));
  const byId = new Map(open.map(c => [c.id, c]));
  const tasks: CaseTask[] = [];
  const ahead = (day: string) => (Date.parse(day) - Date.parse(today)) / 86_400_000;
  for (const c of open) {
    const add = (id: string, priority: CaseTask["priority"], title: string, reason: string, tab: string) => tasks.push({ id: `${c.id}-${id}`, priority, title: `${c.reference} · ${title}`, reason, href: `/cases/${c.id}?tab=${tab}` });
    if (c.expectedPaymentDate && ahead(c.expectedPaymentDate) <= 3) add("deadline", c.expectedPaymentDate <= today ? "urgent" : "action", "Payment date approaching or reached", `Recorded date: ${c.expectedPaymentDate}. Review the open case with its decision owner.`, "assistant");
    if (!c.analystId) add("owner", "action", "Analyst needed", "Assign responsibility for the next checks.", "overview");
    if (["AWAITING_HUMAN_QC", "READY_TO_RELEASE"].includes(c.status)) add("review", "action", "Independent review or release decision", "Check current source validity and reviewer independence.", "assistant");
    const unassessed = findings.filter(f => f.caseId === c.id && f.status === "NOT_STARTED").length;
    if (unassessed) add("checks", "action", `${unassessed} checks not assessed`, "The case assistant explains the remaining checks.", "assistant");
  }
  for (const e of evidence) {
    const c = byId.get(e.caseId);
    if (!c) continue;
    const state = evidenceState(e, today);
    const due = evidenceDueDate(e);
    const soon = state === "CURRENT" && !!due && ahead(due) <= 7;
    if (state === "CURRENT" && !soon) continue;
    tasks.push({ id: `source-${e.id}`, priority: state === "EXPIRED" || state === "RECHECK_DUE" || state === "INVALID" ? "urgent" : "action",
      title: `${c.reference} · ${e.code}: ${soon ? "validity deadline approaching" : EVIDENCE_STATE_LABELS[state].toLowerCase()}`,
      reason: `${e.sourceName}${due ? ` · recorded deadline ${due}` : " · record a validity policy before positive use"}.`, href: `/cases/${c.id}?tab=evidence#e-${e.id}` });
  }
  const rank = { urgent: 0, action: 1, info: 2 };
  return tasks.sort((a, b) => rank[a.priority] - rank[b.priority] || a.id.localeCompare(b.id));
}
