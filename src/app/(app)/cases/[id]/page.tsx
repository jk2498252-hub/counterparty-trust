import Link from "next/link";
import { notFound } from "next/navigation";
import { changeStatusAction } from "@/app/actions/cases";
import { Flash, OutcomeBadge, PageHeader, StatusBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { loadAudit, loadCase } from "@/lib/cases";
import { isUuid } from "@/lib/nav";
import { requireUser } from "@/lib/session";
import { db } from "@/db";
import { counterparties } from "@/db/schema";
import type { CaseStatus } from "@/lib/workflow";
import { OverviewTab } from "./_tabs/overview";
import { IntakeTab } from "./_tabs/intake";
import { ChecksTab } from "./_tabs/checks";
import { EvidenceTab } from "./_tabs/evidence";
import { DocumentsTab } from "./_tabs/documents";
import { IssuesTab } from "./_tabs/issues";
import { OutcomeTab } from "./_tabs/outcome";
import { BankTab } from "./_tabs/bank";
import { TimeTab } from "./_tabs/time";
import { ReviewTab } from "./_tabs/review";
import { HistoryTab } from "./_tabs/history";
import { AssistantTab } from "./_tabs/assistant";

const TABS = [
  ["overview", "Overview"],
  ["assistant", "Smart assistant"],
  ["intake", "Intake"],
  ["checks", "Checks"],
  ["evidence", "Evidence"],
  ["documents", "Documents"],
  ["issues", "Issues"],
  ["outcome", "Outcome"],
  ["bank", "Bank details"],
  ["time", "Time"],
  ["review", "Review & release"],
  ["history", "History"],
] as const;

type StatusAction = { to: CaseStatus; label: string; style?: string; confirm?: string };

function actionsFor(status: CaseStatus): StatusAction[] {
  switch (status) {
    case "DRAFT":
      return [{ to: "INTAKE_COMPLETE", label: "Mark intake complete" }, { to: "CANCELLED", label: "Cancel case", style: "btn-danger", confirm: "Cancel this case?" }];
    case "INTAKE_COMPLETE":
      return [{ to: "IN_PROGRESS", label: "Start checks" }, { to: "DRAFT", label: "Back to intake", style: "btn-secondary" }];
    case "IN_PROGRESS":
      return [
        { to: "AWAITING_HUMAN_QC", label: "Send for review" },
        { to: "AWAITING_CLIENT", label: "Waiting on client", style: "btn-secondary" },
        { to: "AWAITING_ACCESS", label: "Waiting on source", style: "btn-secondary" },
        { to: "CANCELLED", label: "Cancel", style: "btn-danger", confirm: "Cancel this case?" },
      ];
    case "AWAITING_CLIENT":
    case "AWAITING_ACCESS":
      return [{ to: "IN_PROGRESS", label: "Resume work" }];
    case "AWAITING_HUMAN_QC":
      return [{ to: "IN_PROGRESS", label: "Withdraw from review", style: "btn-secondary" }];
    case "READY_TO_RELEASE":
      return [{ to: "IN_PROGRESS", label: "Reopen for changes", style: "btn-secondary", confirm: "Reopening means it must be reviewed again. Continue?" }];
    case "RELEASED":
      return [
        { to: "CLOSED", label: "Close case", style: "btn-secondary" },
        { to: "IN_PROGRESS", label: "Open correction", style: "btn-secondary", confirm: "Open a correction? The released report stays on record and a new version must be reviewed." },
      ];
    default:
      return [];
  }
}

export default async function CasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const c = await loadCase(id);
  if (!c) notFound();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "overview";
  const auditRows = tab === "history" ? await loadAudit(id) : [];
  const supplierRows = tab === "assistant" ? await db.select().from(counterparties) : [];

  return (
    <>
      <PageHeader
        back={{ href: "/cases", label: "All cases" }}
        title={c.counterparty.legalName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{c.reference}</span>· for {c.client.name} · {c.depth.toLowerCase()} · v{c.version}
            <StatusBadge status={c.status} />
            <OutcomeBadge outcome={c.outcome} />
          </span>
        }
        actions={
          <>
            <Link href={`/cases/${id}/report`} className="btn-secondary">
              {c.reports.length ? "Report" : "Preview report"}
            </Link>
            {actionsFor(c.status as CaseStatus).map((a) => (
              <form key={a.to + a.label} action={changeStatusAction}>
                <input type="hidden" name="caseId" value={id} />
                <input type="hidden" name="to" value={a.to} />
                <SubmitButton className={a.style ?? "btn"} confirm={a.confirm}>
                  {a.label}
                </SubmitButton>
              </form>
            ))}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <nav aria-label="Case sections" className="no-print mb-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, labelText]) => (
          <Link
            key={k}
            href={`/cases/${id}?tab=${k}`}
            aria-current={tab === k ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-2 py-2 text-sm font-medium ${tab === k ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
          >
            {labelText}
          </Link>
        ))}
      </nav>
      {tab === "overview" && <OverviewTab c={c} user={user} />}
      {tab === "assistant" && <AssistantTab c={c} suppliers={supplierRows} />}
      {tab === "intake" && <IntakeTab c={c} />}
      {tab === "checks" && <ChecksTab c={c} />}
      {tab === "evidence" && <EvidenceTab c={c} />}
      {tab === "documents" && <DocumentsTab c={c} />}
      {tab === "issues" && <IssuesTab c={c} />}
      {tab === "outcome" && <OutcomeTab c={c} />}
      {tab === "bank" && <BankTab c={c} />}
      {tab === "time" && <TimeTab c={c} user={user} />}
      {tab === "review" && <ReviewTab c={c} user={user} />}
      {tab === "history" && <HistoryTab rows={auditRows} />}
    </>
  );
}
