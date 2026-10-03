import Link from "next/link";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cases, counterparties, paymentInstructions, timeEntries } from "@/db/schema";
import { Empty, Flash, OutcomeBadge, PageHeader, PaymentBadge, StatusBadge } from "@/components/ui";
import { economics } from "@/lib/env";
import { hours, kes } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;

  const [allCases, minutesByCase, pendingPayments] = await Promise.all([
    db
      .select({ c: cases, supplier: counterparties.legalName })
      .from(cases)
      .innerJoin(counterparties, eq(cases.counterpartyId, counterparties.id))
      .orderBy(desc(cases.updatedAt)),
    db.select({ caseId: timeEntries.caseId, minutes: sql<number>`sum(${timeEntries.minutes})::int` }).from(timeEntries).groupBy(timeEntries.caseId),
    db
      .select({ p: paymentInstructions, supplier: counterparties.legalName })
      .from(paymentInstructions)
      .innerJoin(counterparties, eq(paymentInstructions.counterpartyId, counterparties.id))
      .where(inArray(paymentInstructions.status, ["PROPOSED_UNVERIFIED", "FROZEN_PENDING_CONFIRMATION"]))
      .orderBy(desc(paymentInstructions.createdAt)),
  ]);

  const minutes = new Map(minutesByCase.map((m) => [m.caseId, m.minutes]));
  const open = allCases.filter(({ c }) => !["RELEASED", "CLOSED", "CANCELLED"].includes(c.status));
  const waitingReview = allCases.filter(({ c }) => c.status === "AWAITING_HUMAN_QC" || c.status === "READY_TO_RELEASE");
  const mine = open.filter(({ c }) => c.analystId === user.id);
  const done = allCases.filter(({ c }) => c.status === "RELEASED" || c.status === "CLOSED");

  const byDepth = (["DIGITAL", "ENHANCED", "EXTENDED"] as const).map((depth) => {
    const rows = done.filter(({ c }) => c.depth === depth);
    const n = rows.length;
    const totalMin = rows.reduce((s, { c }) => s + (minutes.get(c.id) ?? 0), 0);
    const totalFee = rows.reduce((s, { c }) => s + (c.feeKes ?? 0), 0);
    const totalCost = rows.reduce((s, { c }) => s + ((minutes.get(c.id) ?? 0) / 60) * economics.hourlyCost + c.directCostsKes, 0);
    return {
      depth,
      n,
      avgHours: n ? totalMin / n : 0,
      avgFee: n ? totalFee / n : 0,
      avgCost: n ? totalCost / n : 0,
      margin: totalFee ? Math.round(((totalFee - totalCost) / totalFee) * 100) : null,
    };
  });

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} subtitle="What needs attention today" actions={<Link href="/cases/new" className="btn">New case</Link>} />
      <Flash err={sp.denied ? "You don't have access to that page." : undefined} />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Open cases", open.length],
          ["My open cases", mine.length],
          ["Waiting for review", waitingReview.length],
          ["Bank details pending", pendingPayments.length],
        ].map(([k, v]) => (
          <div key={k} className="card">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</div>
            <div className="mt-1 text-3xl font-bold">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">{user.role === "ANALYST" ? "My open cases" : "Waiting for review or release"}</h2>
          {(user.role === "ANALYST" ? mine : waitingReview).length ? (
            <ul className="divide-y divide-line text-sm">
              {(user.role === "ANALYST" ? mine : waitingReview).slice(0, 10).map(({ c, supplier }) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/cases/${c.id}`} className="hover:underline"><span className="font-mono text-xs text-muted">{c.reference}</span> {supplier}</Link>
                  <StatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing waiting.</Empty>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">Bank details waiting for confirmation</h2>
          {pendingPayments.length ? (
            <ul className="divide-y divide-line text-sm">
              {pendingPayments.slice(0, 10).map(({ p, supplier }) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/payments/${p.id}`} className="hover:underline">{supplier} · {p.bankName} •••• {p.accountLast4}</Link>
                  <PaymentBadge status={p.status} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No pending bank details.</Empty>
          )}
        </section>

        <section className="card lg:col-span-2">
          <h2 className="mb-1 font-semibold">Pilot economics (released cases)</h2>
          <p className="mb-3 text-sm text-muted">
            Real hours and margins from logged time, at {kes(economics.hourlyCost)} per person-hour plus direct costs. Target: 30% or better.
          </p>
          <table className="table">
            <thead><tr><th>Depth</th><th>Cases</th><th>Avg person-hours</th><th>Avg fee</th><th>Avg cost</th><th>Margin</th></tr></thead>
            <tbody>
              {byDepth.map((d) => (
                <tr key={d.depth}>
                  <td>{d.depth.toLowerCase()}</td>
                  <td>{d.n}</td>
                  <td>{d.n ? hours(d.avgHours) : "—"}</td>
                  <td>{d.n ? kes(d.avgFee) : "—"}</td>
                  <td>{d.n ? kes(d.avgCost) : "—"}</td>
                  <td className={d.margin !== null && d.margin < 30 ? "font-semibold text-red-700" : ""}>{d.margin === null ? "—" : `${d.margin}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Recently released</h2>
          {done.length ? (
            <ul className="divide-y divide-line text-sm">
              {done.slice(0, 8).map(({ c, supplier }) => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/cases/${c.id}`} className="hover:underline"><span className="font-mono text-xs text-muted">{c.reference}</span> {supplier}</Link>
                  <OutcomeBadge outcome={c.outcome} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No released reports yet.</Empty>
          )}
        </section>
      </div>
    </>
  );
}
