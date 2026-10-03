import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { cases, clients, counterparties, users } from "@/db/schema";
import { Empty, Flash, OutcomeBadge, PageHeader, StatusBadge } from "@/components/ui";
import { dateStr } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { STATUS_LABELS, type CaseStatus } from "@/lib/workflow";

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; mine?: string; ok?: string; err?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters: SQL[] = [];
  if (sp.status && sp.status in STATUS_LABELS) filters.push(eq(cases.status, sp.status as CaseStatus));
  if (sp.mine === "1") filters.push(eq(cases.analystId, user.id));
  if (sp.q?.trim()) {
    const q = `%${sp.q.trim().replace(/[%_]/g, "")}%`;
    filters.push(or(ilike(counterparties.legalName, q), ilike(clients.name, q), ilike(cases.reference, q))!);
  }
  const rows = await db
    .select({ c: cases, client: clients.name, supplier: counterparties.legalName, analyst: users.name })
    .from(cases)
    .innerJoin(clients, eq(cases.clientId, clients.id))
    .innerJoin(counterparties, eq(cases.counterpartyId, counterparties.id))
    .leftJoin(users, eq(cases.analystId, users.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(cases.updatedAt))
    .limit(200);

  return (
    <>
      <PageHeader title="Cases" actions={<Link href="/cases/new" className="btn">New case</Link>} />
      <Flash ok={sp.ok} err={sp.err} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search supplier, client or reference" className="input max-w-xs" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-[14rem]">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} /> Mine</label>
        <button className="btn-secondary">Filter</button>
      </form>
      {rows.length ? (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Reference</th><th>Supplier</th><th>Client</th><th>Depth</th><th>Analyst</th><th>Status</th><th>Outcome</th><th>Updated</th></tr></thead>
            <tbody>
              {rows.map(({ c, client, supplier, analyst }) => (
                <tr key={c.id} className="hover:bg-paper">
                  <td className="font-mono"><Link href={`/cases/${c.id}`} className="text-brand underline">{c.reference}</Link></td>
                  <td className="font-medium">{supplier}</td>
                  <td>{client}</td>
                  <td>{c.depth.toLowerCase()}</td>
                  <td>{analyst ?? "—"}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td><OutcomeBadge outcome={c.outcome} /></td>
                  <td className="whitespace-nowrap">{dateStr(c.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No cases match. <Link href="/cases/new" className="underline">Open a new case</Link>.</Empty>
      )}
    </>
  );
}
