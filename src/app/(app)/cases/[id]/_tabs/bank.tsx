import Link from "next/link";
import { Empty, PaymentBadge } from "@/components/ui";
import type { LoadedCase } from "@/lib/cases";
import { dateTimeStr } from "@/lib/format";

export function BankTab({ c }: { c: LoadedCase }) {
  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold">Payment instructions for this case</h2>
        <Link href={`/payments/new?counterpartyId=${c.counterpartyId}&caseId=${c.id}`} className="btn">Log bank details</Link>
      </div>
      {c.payments.length ? (
        <table className="table">
          <thead>
            <tr><th>Beneficiary</th><th>Bank</th><th>Account</th><th>Change?</th><th>Status</th><th>Logged</th></tr>
          </thead>
          <tbody>
            {c.payments.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/payments/${p.id}`} className="text-brand underline">{p.beneficiaryName}</Link></td>
                <td>{p.bankName}</td>
                <td className="font-mono">•••• {p.accountLast4}</td>
                <td>{p.isChange ? "Yes" : "No"}</td>
                <td><PaymentBadge status={p.status} /></td>
                <td>{dateTimeStr(p.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>No bank details logged for this case.</Empty>
      )}
      <p className="mt-4 text-xs text-muted">
        Bank details are encrypted. A changed instruction stays frozen until it is confirmed through an independent channel and
        approved by two different people. This system never sends money.
      </p>
    </section>
  );
}
