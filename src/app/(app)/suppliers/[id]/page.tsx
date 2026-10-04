import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, clients, counterparties, paymentInstructions, reports } from "@/db/schema";
import { Empty, OutcomeBadge, PageHeader, PaymentBadge, StatusBadge } from "@/components/ui";
import { dateStr } from "@/lib/format";
import { isUuid } from "@/lib/nav";
import { requireUser } from "@/lib/session";
import { evidenceDateRange } from "@/lib/freshness";
import { reportMatches } from "@/lib/integrity";
import type { ReportData } from "@/lib/report";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [cp] = await db.select().from(counterparties).where(eq(counterparties.id, id));
  if (!cp) notFound();
  const [caseRows, payRows, reportRows] = await Promise.all([
    db.select({ c: cases, client: clients.name }).from(cases).innerJoin(clients, eq(cases.clientId, clients.id)).where(eq(cases.counterpartyId, id)).orderBy(desc(cases.createdAt)),
    db.select().from(paymentInstructions).where(eq(paymentInstructions.counterpartyId, id)).orderBy(desc(paymentInstructions.createdAt)),
    db.select({ report: reports }).from(reports).innerJoin(cases, eq(reports.caseId, cases.id)).where(eq(cases.counterpartyId, id)).orderBy(desc(reports.createdAt)).limit(1),
  ]);
  const lastReport = reportRows[0]?.report;
  const validReport = !!lastReport && reportMatches(lastReport);
  const snapshot = validReport ? lastReport.snapshot as ReportData : null;
  const dates = snapshot ? evidenceDateRange(snapshot.evidence) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/suppliers", label: "Suppliers" }}
        title={cp.legalName}
        subtitle={[cp.registrationNumber, cp.kraPin, cp.domain].filter(Boolean).join(" · ") || "No identifiers recorded yet"}
        actions={
          <>
            <Link href={`/payments/new?counterpartyId=${cp.id}`} className="btn-secondary">Log bank details</Link>
            <Link href={`/cases/new?counterpartyId=${cp.id}`} className="btn">New case for this supplier</Link>
          </>
        }
      />

      <div className="mb-6 rounded-md border border-line bg-white px-4 py-3 text-sm">
        {!lastReport && "No released report for this supplier yet."}
        {lastReport && !validReport && "The latest released report failed its integrity check. Ask an administrator to restore it."}
        {snapshot && <>
          <p>Latest report issued {dateStr(lastReport!.createdAt)}: <OutcomeBadge outcome={snapshot.outcome} /> <Link href={`/cases/${lastReport!.caseId}/report?r=${lastReport!.id}`} className="underline">View released report</Link></p>
          <p className="mt-2">{dates ? <>Underlying examined sources checked {dateStr(dates.oldest)}{dates.newest !== dates.oldest && <> to {dateStr(dates.newest)}</>}.</> : "No examined source dates recorded."} A recent issue date does not make those checks current. Confirm source validity and changes before using findings for a new transaction; representatives, documents and bank details need transaction-specific checks.</p>
        </>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Profile</h2>
          <dl className="space-y-2">
            {[
              ["Entity type", cp.entityType],
              ["Registration", cp.registrationNumber && `${cp.registrationNumber}${cp.registrationAuthority ? ` (${cp.registrationAuthority})` : ""}`],
              ["KRA PIN", cp.kraPin],
              ["Trading / former names", cp.tradingNames],
              ["Domain", cp.domain],
              ["Sector", cp.sector],
              ["Registered address", cp.registeredAddress],
              ["Operating address", cp.operatingAddress],
            ].map(([k, v]) => (
              <div key={k as string}><dt className="text-muted">{k}</dt><dd>{v || "—"}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">Edit these details from the Intake tab of an open case.</p>
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-3 font-semibold">Cases</h2>
            {caseRows.length ? (
              <table className="table">
                <thead><tr><th>Reference</th><th>Client</th><th>Status</th><th>Outcome</th><th>Released</th></tr></thead>
                <tbody>
                  {caseRows.map(({ c, client }) => (
                    <tr key={c.id}>
                      <td className="font-mono"><Link href={`/cases/${c.id}`} className="text-brand underline">{c.reference}</Link></td>
                      <td>{client}</td>
                      <td><StatusBadge status={c.status} /></td>
                      <td><OutcomeBadge outcome={c.outcome} /></td>
                      <td>{dateStr(c.releasedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No cases.</Empty>
            )}
          </section>
          <section className="card">
            <h2 className="mb-3 font-semibold">Bank details history</h2>
            {payRows.length ? (
              <table className="table">
                <thead><tr><th>Logged</th><th>Beneficiary</th><th>Account</th><th>Status</th></tr></thead>
                <tbody>
                  {payRows.map((p) => (
                    <tr key={p.id}>
                      <td>{dateStr(p.createdAt)}</td>
                      <td><Link href={`/payments/${p.id}`} className="text-brand underline">{p.beneficiaryName}</Link><div className="text-xs text-muted">{p.bankName}</div></td>
                      <td className="font-mono">•••• {p.accountLast4}</td>
                      <td><PaymentBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No bank details logged.</Empty>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
