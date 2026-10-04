import Link from "next/link";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { cases, counterparties } from "@/db/schema";
import { Empty, PageHeader } from "@/components/ui";
import { dateStr } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  const { q } = await searchParams;
  const term = q?.trim() ? `%${q.trim().replace(/[%_]/g, "")}%` : null;
  const rows = await db
    .select({
      cp: counterparties,
      caseCount: sql<number>`count(${cases.id})::int`,
      lastReleased: sql<Date | null>`max(${cases.releasedAt})`,
    })
    .from(counterparties)
    .leftJoin(cases, eq(cases.counterpartyId, counterparties.id))
    .where(term ? or(ilike(counterparties.legalName, term), ilike(counterparties.kraPin, term), ilike(counterparties.registrationNumber, term)) : undefined)
    .groupBy(counterparties.id)
    .orderBy(desc(counterparties.updatedAt))
    .limit(300);
  return (
    <>
      <PageHeader title="Suppliers" subtitle="Each profile separates report issue dates from the dates its sources were checked." />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q ?? ""} className="input max-w-sm" placeholder="Name, KRA PIN or registration number" />
        <button className="btn-secondary">Search</button>
      </form>
      {rows.length ? (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Supplier</th><th>Registration</th><th>KRA PIN</th><th>Cases</th><th>Last released</th></tr></thead>
            <tbody>
              {rows.map(({ cp, caseCount, lastReleased }) => (
                <tr key={cp.id}>
                  <td><Link href={`/suppliers/${cp.id}`} className="font-medium text-brand underline">{cp.legalName}</Link></td>
                  <td className="font-mono">{cp.registrationNumber ?? "—"}</td>
                  <td className="font-mono">{cp.kraPin ?? "—"}</td>
                  <td>{caseCount}</td>
                  <td>{dateStr(lastReleased)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No suppliers yet. They are created when you open a case.</Empty>
      )}
    </>
  );
}
