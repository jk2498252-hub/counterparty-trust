import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, counterparties, paymentApprovals, paymentInstructions, users } from "@/db/schema";
import { approveInstructionAction, recordConfirmationAction, rejectInstructionAction, revokeInstructionAction } from "@/app/actions/payments";
import { Field, Flash, PageHeader, PaymentBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { paymentApprovalsRequired } from "@/lib/env";
import { dateStr, dateTimeStr } from "@/lib/format";
import { isUuid } from "@/lib/nav";
import { approvalBlockers, isPending, type PaymentStatus } from "@/lib/payments";
import { isPrivileged, requireUser } from "@/lib/session";

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; reveal?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const [row] = await db
    .select({ p: paymentInstructions, supplier: counterparties.legalName, caseRef: cases.reference })
    .from(paymentInstructions)
    .innerJoin(counterparties, eq(paymentInstructions.counterpartyId, counterparties.id))
    .leftJoin(cases, eq(paymentInstructions.caseId, cases.id))
    .where(eq(paymentInstructions.id, id));
  if (!row) notFound();
  const { p } = row;
  const approvals = await db
    .select({ a: paymentApprovals, name: users.name })
    .from(paymentApprovals)
    .innerJoin(users, eq(paymentApprovals.userId, users.id))
    .where(eq(paymentApprovals.instructionId, id));
  const [creator] = await db.select({ name: users.name }).from(users).where(eq(users.id, p.createdById));

  let fullAccount: string | null = null;
  if (sp.reveal === "1" && isPrivileged(user.role)) {
    fullAccount = decrypt(p.accountEnc);
    await audit(user.id, "payment.account_revealed", { instructionId: id }, p.caseId);
  }

  const pending = isPending(p.status as PaymentStatus);
  const hasConfirmation = !!p.confirmedAt && !!p.channelIndependent;
  const myApprovalProblems = approvalBlockers({
    status: p.status as PaymentStatus,
    approverId: user.id,
    createdById: p.createdById,
    confirmationRecordedById: p.confirmationRecordedById,
    hasConfirmation,
    existingApproverIds: approvals.map((a) => a.a.userId),
  });

  return (
    <>
      <PageHeader
        back={{ href: "/payments", label: "Bank details" }}
        title={`${row.supplier}: ${p.bankName} •••• ${p.accountLast4}`}
        subtitle={<span className="flex items-center gap-2"><PaymentBadge status={p.status} />{p.isChange && <span>Changed instruction</span>}{row.caseRef && p.caseId && <Link href={`/cases/${p.caseId}?tab=bank`} className="underline">{row.caseRef}</Link>}</span>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card text-sm">
          <h2 className="mb-3 font-semibold">Instruction as received</h2>
          <dl className="space-y-2">
            <div><dt className="text-muted">Beneficiary</dt><dd>{p.beneficiaryName}</dd></div>
            <div><dt className="text-muted">Bank</dt><dd>{p.bankName}{p.branch ? `, ${p.branch}` : ""}</dd></div>
            <div>
              <dt className="text-muted">Account</dt>
              <dd className="font-mono">
                {fullAccount ?? `•••• ${p.accountLast4}`}
                {!fullAccount && isPrivileged(user.role) && <Link href={`/payments/${id}?reveal=1`} className="ml-2 font-sans text-xs text-brand underline">Show (logged)</Link>}
              </dd>
            </div>
            <div><dt className="text-muted">Currency</dt><dd>{p.currency}</dd></div>
            <div><dt className="text-muted">Effective date requested</dt><dd>{dateStr(p.requestedEffectiveDate)}</dd></div>
            <div><dt className="text-muted">Source</dt><dd>{p.sourceDescription}</dd></div>
            <div><dt className="text-muted">Logged by</dt><dd>{creator?.name} · {dateTimeStr(p.createdAt)}</dd></div>
            {p.decisionNote && <div><dt className="text-muted">Decision note</dt><dd>{p.decisionNote}</dd></div>}
          </dl>
        </section>

        <div className="space-y-6 lg:col-span-2">
          <section className="card">
            <h2 className="mb-1 font-semibold">1. Independent confirmation</h2>
            <p className="mb-4 text-sm text-muted">
              Call or write to the supplier using contact details from an earlier trusted source (registry record, a previously verified
              contact, the client&apos;s own records). Never use a phone number or email taken from the request itself.
            </p>
            {hasConfirmation && (
              <div className="mb-4 rounded-md bg-paper p-3 text-sm">
                Confirmed with <strong>{p.confirmedWithName}</strong>{p.confirmedWithRole ? ` (${p.confirmedWithRole})` : ""} via {p.confirmationChannel} on {dateTimeStr(p.confirmedAt)}.
                <div className="text-muted">Contact source: {p.channelEstablishedHow}</div>
                {p.confirmationNotes && <div className="text-muted">Notes: {p.confirmationNotes}</div>}
              </div>
            )}
            {pending && (
              <details open={!hasConfirmation}>
              <summary className={hasConfirmation ? "mb-3 cursor-pointer text-sm text-brand underline" : "hidden"}>Replace this confirmation</summary>
              <form action={recordConfirmationAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Channel used" name="confirmationChannel">
                  <input id="confirmationChannel" name="confirmationChannel" className="input" placeholder="e.g. Phone call" />
                </Field>
                <Field label="Where the contact details came from" name="channelEstablishedHow">
                  <input id="channelEstablishedHow" name="channelEstablishedHow" className="input" placeholder="e.g. Number on CR12 / prior verified contact" />
                </Field>
                <Field label="Confirmed with (name)" name="confirmedWithName">
                  <input id="confirmedWithName" name="confirmedWithName" className="input" />
                </Field>
                <Field label="Their role" name="confirmedWithRole">
                  <input id="confirmedWithRole" name="confirmedWithRole" className="input" />
                </Field>
                <div className="md:col-span-2">
                  <textarea name="confirmationNotes" className="input" rows={2} placeholder="What exactly was confirmed: beneficiary, bank, account, reason for any change" />
                </div>
                <label className="flex items-start gap-2 text-sm md:col-span-2">
                  <input type="checkbox" name="channelIndependent" className="mt-1" />
                  The contact details did not come from the request or the person asking for the change.
                </label>
                <div><SubmitButton className="btn-secondary">{hasConfirmation ? "Replace confirmation" : "Record confirmation"}</SubmitButton></div>
              </form>
              </details>
            )}
          </section>

          <section className="card">
            <h2 className="mb-1 font-semibold">2. Approvals ({approvals.length} of {paymentApprovalsRequired})</h2>
            <p className="mb-4 text-sm text-muted">Two different people, neither of whom logged the instruction.</p>
            {approvals.length > 0 && (
              <ul className="mb-4 text-sm">
                {approvals.map(({ a, name }) => <li key={a.id}>{name} · {dateTimeStr(a.createdAt)}{a.note ? ` · ${a.note}` : ""}</li>)}
              </ul>
            )}
            {pending && (
              myApprovalProblems.length ? (
                <ul className="list-disc pl-5 text-sm text-muted">{myApprovalProblems.map((m) => <li key={m}>{m}</li>)}</ul>
              ) : (
                <form action={approveInstructionAction} className="flex gap-2">
                  <input type="hidden" name="id" value={id} />
                  <input name="note" className="input" placeholder="Note (optional)" />
                  <SubmitButton confirm="Approve these bank details as confirmed within scope?">Approve</SubmitButton>
                </form>
              )
            )}
          </section>

          {pending && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Reject</h2>
              <form action={rejectInstructionAction} className="flex gap-2">
                <input type="hidden" name="id" value={id} />
                <input name="decisionNote" className="input" placeholder="Reason" />
                <SubmitButton className="btn-danger" confirm="Reject this instruction?">Reject</SubmitButton>
              </form>
            </section>
          )}
          {p.status === "CONFIRMED_WITHIN_SCOPE" && isPrivileged(user.role) && (
            <section className="card">
              <h2 className="mb-3 font-semibold">Revoke confirmation</h2>
              <form action={revokeInstructionAction} className="flex gap-2">
                <input type="hidden" name="id" value={id} />
                <input name="decisionNote" className="input" placeholder="Reason" />
                <SubmitButton className="btn-danger" confirm="Revoke this confirmation?">Revoke</SubmitButton>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
