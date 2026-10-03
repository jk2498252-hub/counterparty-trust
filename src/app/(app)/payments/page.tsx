import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { counterparties, paymentInstructions } from "@/db/schema";
import { Empty, PageHeader, PaymentBadge } from "@/components/ui";
import { dateTimeStr } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function PaymentsPage() {
  await requireUser();
  const rows = await db
    .select({ p: paymentInstructions, supplier: counterparties.legalName })
    .from(paymentInstructions)
    .innerJoin(counterparties, eq(paymentInstructions.counterpartyId, counterparties.id))
    .orderBy(desc(paymentInstructions.createdAt))
    .limit(300);
  return (
    <>
      <PageHeader
        title="Bank details"
        subtitle="Every new or changed payment instruction, confirmed independently and approved by two people. Records only: nothing here moves money."
        actions={<Link href="/payments/new" className="btn">Log bank details</Link>}
      />
      {rows.length ? (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Supplier</th><th>Beneficiary</th><th>Bank</th><th>Account</th><th>Change?</th><th>Status</th><th>Logged</th></tr></thead>
            <tbody>
              {rows.map(({ p, supplier }) => (
                <tr key={p.id}>
                  <td className="font-medium">{supplier}</td>
                  <td><Link href={`/payments/${p.id}`} className="text-brand underline">{p.beneficiaryName}</Link></td>
                  <td>{p.bankName}</td>
                  <td className="font-mono">•••• {p.accountLast4}</td>
                  <td>{p.isChange ? "Yes" : "No"}</td>
                  <td><PaymentBadge status={p.status} /></td>
                  <td className="whitespace-nowrap">{dateTimeStr(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No bank details logged yet.</Empty>
      )}
    </>
  );
}
