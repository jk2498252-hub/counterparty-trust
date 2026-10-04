import { FINDING_STATUS_LABELS, OUTCOME_LABELS } from "@/lib/layers";
import type { ReportData } from "@/lib/report";
import { dateStr, label } from "@/lib/format";
import { DISCREPANCY_CODES } from "@/lib/layers";
import { evidenceDateRange } from "@/lib/freshness";

export function ReportView({ data, released, hash }: { data: ReportData; released: boolean; hash?: string }) {
  const unresolved = data.layers.filter((l) => l.status !== "VERIFIED");
  const openIssues = data.issues.filter((i) => !["RESOLVED", "EXPLAINED"].includes(i.state));
  const noConfirmedPayment = !data.payments.some((p) => p.status === "CONFIRMED_WITHIN_SCOPE");
  const dates = evidenceDateRange(data.evidence);
  return (
    <article className="mx-auto max-w-3xl rounded-lg border border-line bg-white p-8 text-[15px] leading-relaxed print:border-0 print:p-0">
      {!released && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900">
          DRAFT PREVIEW — not reviewed or released. Do not send to the client.
        </div>
      )}
      <header className="mb-6 border-b border-line pb-4">
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Pre-transaction supplier verification · Kenya</div>
        <h1 className="mt-2 text-2xl font-bold">{data.supplier.legalName}</h1>
        <p className="text-sm text-muted">
          Case {data.reference} · version {data.version} · {released ? "report issued" : "preview prepared"} {dateStr(data.asOf)} · prepared for {data.client}
        </p>
        <p className="mt-1 text-sm text-muted">{dates ? <>Examined sources checked {dateStr(dates.oldest)}{dates.newest !== dates.oldest && <> to {dateStr(dates.newest)}</>}.</> : "No examined source dates recorded."} Issuing this report does not renew the underlying checks.</p>
      </header>

      <section className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Outcome</div>
        <div className="mt-1 text-xl font-bold">{data.outcome ? OUTCOME_LABELS[data.outcome] : "Not concluded"}</div>
        {data.outcomeSummary && <p className="mt-2">{data.outcomeSummary}</p>}
        <p className="mt-3 text-sm text-muted">
          This report records what the examined evidence supports at the individual check dates, within the agreed scope. It is not a
          guarantee of the supplier&apos;s conduct, delivery or solvency, not legal, credit or AML advice, and not an instruction to pay.
          The decision to contract or pay remains with {data.client}.
        </p>
      </section>

      <section className="mb-6 grid gap-2 text-sm sm:grid-cols-2">
        <div><span className="text-muted">Decision supported:</span> {data.decisionPurpose}</div>
        <div><span className="text-muted">Service depth:</span> {label(data.depth)}</div>
        <div><span className="text-muted">Registration number:</span> {data.supplier.registrationNumber ?? "not established"}</div>
        <div><span className="text-muted">KRA PIN:</span> {data.supplier.kraPin ?? "not established"}</div>
        {data.amount && <div><span className="text-muted">Transaction:</span> {data.currency} {Number(data.amount).toLocaleString("en-KE")}</div>}
        {data.supplier.domain && <div><span className="text-muted">Domain:</span> {data.supplier.domain}</div>}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Findings</h2>
        <table className="table">
          <thead><tr><th>Area</th><th>Result</th><th>Finding</th><th>Evidence</th></tr></thead>
          <tbody>
            {data.layers.map((l) => (
              <tr key={l.layer}>
                <td className="font-medium">{l.title}{l.critical && <div className="text-xs text-muted">critical</div>}</td>
                <td className="whitespace-nowrap">{FINDING_STATUS_LABELS[l.status]}</td>
                <td>
                  {l.finding ?? "—"}
                  {l.scopeChangeNote && <div className="mt-1 text-xs text-muted">Scope narrowed: {l.scopeChangeNote}</div>}
                </td>
                <td className="font-mono text-xs">{l.evidenceCodes.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {data.issues.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Issues</h2>
          <ul className="space-y-2 text-sm">
            {data.issues.map((i, n) => (
              <li key={n}>
                <strong>{i.code} {DISCREPANCY_CODES[i.code]}</strong> ({label(i.severity)}, {label(i.state)}{i.established ? ", established" : ", not established"}): {i.description}
                {i.effect && <> Effect: {i.effect}</>}
                {i.explanation && <> Explanation: {i.explanation}</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Payment details</h2>
        {data.payments.length ? (
          <ul className="text-sm">
            {data.payments.map((p, n) => (
              <li key={n}>{p.beneficiaryName}, {p.bankName}, account {p.accountMasked}: <strong>{p.statusLabel}</strong>{p.isChange ? " (changed instruction)" : ""}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No payment instruction was supplied or checked.</p>
        )}
        {noConfirmedPayment && (
          <p className="mt-2 text-sm font-semibold">No bank account has been confirmed for this supplier. Do not treat this report as approval of any payment details.</p>
        )}
      </section>

      {(unresolved.length > 0 || openIssues.length > 0 || data.nextSteps) && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Unresolved items and next steps</h2>
          {unresolved.length > 0 && (
            <ul className="mb-2 list-disc pl-5 text-sm">
              {unresolved.map((l) => <li key={l.layer}>{l.title}: {FINDING_STATUS_LABELS[l.status].toLowerCase()}</li>)}
            </ul>
          )}
          {data.nextSteps && <p className="text-sm whitespace-pre-line">{data.nextSteps}</p>}
          <p className="mt-2 text-sm text-muted">Missing records are gaps in evidence, not evidence of wrongdoing.</p>
        </section>
      )}

      {data.exclusions && (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-semibold">Not included in this review</h2>
          <p className="text-sm whitespace-pre-line">{data.exclusions}</p>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold">Evidence index</h2>
        <ol className="space-y-2 text-sm">
          {data.evidence.map((e) => (
            <li key={e.code}>
              <span className="font-mono font-semibold">{e.code}</span> {e.sourceName}
              {e.authority ? ` (${e.authority})` : ""} · {label(e.category)} · {label(e.accessResult)} · checked {dateStr(e.checkedDate)}
              {e.locator ? ` · ${e.locator}` : ""}. {e.summary}
              {e.url && <div className="break-all text-xs text-muted">{e.url}</div>}
              {e.capture && <div className="break-all text-xs text-muted">Capture: {e.capture.name} · SHA-256 {e.capture.sha256}</div>}
            </li>
          ))}
        </ol>
      </section>

      <footer className="border-t border-line pt-4 text-xs text-muted">
        {data.review ? <>Independently reviewed by {data.review.reviewer} on {dateStr(data.review.date)}. </> : <>Not yet independently reviewed. </>}
        {hash && <>Snapshot fingerprint (SHA-256): <span className="font-mono break-all">{hash}</span>. This fingerprints the stored report data; a printed PDF is a separate file. </>}
        To dispute or correct a finding, contact the case owner with supporting evidence; corrections create a new reviewed version.
      </footer>
    </article>
  );
}
