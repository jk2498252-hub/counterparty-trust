import Link from "next/link";
import { assignAnalystAction } from "@/app/actions/cases";
import { FindingBadge, OutcomeBadge, PaymentBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";
import { economics } from "@/lib/env";
import { dateStr, hours, kes } from "@/lib/format";
import { LAYER_DEFINITIONS, titled } from "@/lib/layers";
import { suggestOutcome } from "@/lib/outcome";
import type { SessionUser } from "@/lib/session";

export function OverviewTab({ c, user }: { c: LoadedCase; user: SessionUser }) {
  const suggestion = suggestOutcome(titled(c.findings), c.discrepancies);
  const minutes = c.timeEntries.reduce((s, t) => s + t.minutes, 0);
  const cost = (minutes / 60) * economics.hourlyCost + c.directCostsKes;
  const fee = c.feeKes ?? 0;
  const margin = fee ? Math.round(((fee - cost) / fee) * 100) : null;
  const done = c.findings.filter((f) => f.status !== "NOT_STARTED").length;
  const openIssues = c.discrepancies.filter((d) => !["EXPLAINED", "RESOLVED"].includes(d.state)).length;
  const analysts = c.users.filter((u) => u.active && u.role !== "REVIEWER");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card lg:col-span-2">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Checks: {done} of {c.findings.length} assessed</h2>
          <Link href={`/cases/${c.id}?tab=checks`} className="text-sm text-brand underline">Open checks</Link>
        </div>
        <ul className="divide-y divide-line">
          {c.findings.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <Link href={`/cases/${c.id}?tab=checks#${f.layer}`} className="hover:underline">
                {LAYER_DEFINITIONS[f.layer].title}
                {f.critical && <span className="ml-2 text-xs font-semibold text-red-700">critical</span>}
              </Link>
              <span className="flex items-center gap-2">
                <span className="text-xs text-muted">{f.evidenceIds.length} evidence</span>
                <FindingBadge status={f.status} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 rounded-md bg-paper p-4 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            Strongest outcome the evidence allows now: <OutcomeBadge outcome={suggestion.outcome} />
          </div>
          <ul className="list-disc pl-5 text-muted">
            {suggestion.reasons.slice(0, 6).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </section>

      <div className="space-y-6">
        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Decision</h2>
          <p className="mb-3">{c.decisionPurpose}</p>
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-muted">Amount</dt>
            <dd>{c.amount ? `${c.currency} ${Number(c.amount).toLocaleString("en-KE")}` : "—"}</dd>
            <dt className="text-muted">Payment due</dt>
            <dd>{dateStr(c.expectedPaymentDate)}</dd>
            <dt className="text-muted">Decision owner</dt>
            <dd>{c.decisionOwner ?? "—"}</dd>
            <dt className="text-muted">Open issues</dt>
            <dd>{openIssues}</dd>
            <dt className="text-muted">Authority confirmed</dt>
            <dd>{c.commissioningAuthorityConfirmed ? "Yes" : <span className="font-semibold text-red-700">No</span>}</dd>
          </dl>
        </section>

        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">People</h2>
          <p className="mb-2">Analyst: <strong>{c.userName(c.analystId)}</strong></p>
          {user.role !== "REVIEWER" && (
            <form action={assignAnalystAction} className="flex gap-2">
              <input type="hidden" name="caseId" value={c.id} />
              <select name="analystId" className="input" defaultValue={c.analystId ?? ""}>
                <option value="" disabled>Choose analyst</option>
                {analysts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <SubmitButton className="btn-secondary">Assign</SubmitButton>
            </form>
          )}
          <p className="mt-3 text-xs text-muted">A different reviewer must approve the case before release.</p>
        </section>

        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Pilot economics</h2>
          <dl className="grid grid-cols-2 gap-y-2">
            <dt className="text-muted">Time logged</dt>
            <dd>{hours(minutes)}</dd>
            <dt className="text-muted">Fee</dt>
            <dd>{kes(fee || null)}</dd>
            <dt className="text-muted">Cost so far</dt>
            <dd>{kes(cost)}</dd>
            <dt className="text-muted">Margin</dt>
            <dd className={margin !== null && margin < 30 ? "font-semibold text-red-700" : ""}>{margin === null ? "—" : `${margin}%`}</dd>
          </dl>
        </section>

        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Bank details</h2>
          {c.payments.length ? (
            <ul className="space-y-2">
              {c.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <Link href={`/payments/${p.id}`} className="hover:underline">{p.bankName} •••• {p.accountLast4}</Link>
                  <PaymentBadge status={p.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No payment instruction logged.</p>
          )}
        </section>
      </div>
    </div>
  );
}
