import Link from "next/link";
import { Badge, Empty, OutcomeBadge } from "@/components/ui";
import { RefreshAttention } from "@/components/refresh-attention";
import { analyseCase, handoverDraft } from "@/lib/case-assistant";
import type { LoadedCase } from "@/lib/cases";
import { supplierMatches, type SupplierIdentity } from "@/lib/supplier-matching";

export function AssistantTab({ c, suppliers }: { c: LoadedCase; suppliers: SupplierIdentity[] }) {
  const a = analyseCase(c);
  const matches = supplierMatches(c.counterparty, suppliers);
  return <div className="space-y-6">
    <RefreshAttention />
    <section className="card">
      <h2 className="mb-2 text-lg font-semibold">Smart case assistant</h2>
      <p className="text-sm text-muted">Guidance from the records and workflow rules. It refreshes every minute while this view is active. Evidence, verification outcomes and release decisions remain accountable to your team.</p>
      {a.archived ? <p className="mt-3 text-sm">This case is historical. Its released report stays frozen; source validity shown here is evaluated today.</p> : <div className="mt-4 flex flex-wrap items-center gap-3 text-sm"><Badge color={a.blockers.length ? "amber" : "blue"}>{a.blockers.length} content blockers</Badge><span>Current evidence allows:</span><OutcomeBadge outcome={a.suggestion.outcome} /></div>}
    </section>
    {matches.length > 0 && <section className="card border-amber-200">
      <h2 className="mb-2 font-semibold">Possible matching supplier profiles</h2>
      <p className="mb-3 text-sm text-muted">Confirm the exact entity before reusing a profile. A match is a data-quality check; shared names or websites can describe separate companies.</p>
      <ul className="space-y-2 text-sm">{matches.slice(0, 10).map(m => <li key={m.supplier.id}><Link className="text-brand underline" href={`/suppliers/${m.supplier.id}`}>{m.supplier.legalName}</Link> · {m.reasons.join(", ")}</li>)}</ul>
    </section>}
    <section className="card">
      <h2 className="mb-3 font-semibold">Next actions</h2>
      {a.tasks.length ? <ul className="divide-y divide-line">{a.tasks.map(t => <li className="py-3" key={t.id}><div className="mb-1 flex items-center gap-2"><Badge color={t.priority === "urgent" ? "red" : t.priority === "action" ? "amber" : "blue"}>{t.priority === "urgent" ? "Needs attention" : t.priority === "action" ? "Action" : "Next step"}</Badge><Link href={t.href} className="text-sm font-semibold text-brand hover:underline">{t.title}</Link></div><p className="text-sm text-muted">{t.reason}</p></li>)}</ul> : <Empty>{a.archived ? "No active tasks for a historical case." : "No outstanding actions found."}</Empty>}
    </section>
    {!a.archived && a.blockers.length > 0 && <section className="card"><h2 className="mb-3 font-semibold">What blocks review or release</h2><ul className="list-disc space-y-1 pl-5 text-sm">{a.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul><p className="mt-3 text-xs text-muted">File integrity and reviewer permissions are checked again when an action is submitted.</p></section>}
    <section className="card">
      <h2 className="mb-2 font-semibold">Evidence-linked handover draft</h2>
      <p className="mb-3 text-sm text-muted">Copy this draft into your internal handover and check it before sharing. It uses recorded findings and evidence codes. No message is sent.</p>
      <label className="sr-only" htmlFor="handover-draft">Internal handover draft</label><textarea id="handover-draft" className="input text-sm" rows={14} readOnly value={handoverDraft(c)} />
    </section>
  </div>;
}
