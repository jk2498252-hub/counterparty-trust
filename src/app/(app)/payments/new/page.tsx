import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, counterparties } from "@/db/schema";
import { createInstructionAction } from "@/app/actions/payments";
import { Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { isUuid } from "@/lib/nav";
import { requireUser } from "@/lib/session";

export default async function NewPaymentPage({ searchParams }: { searchParams: Promise<{ err?: string; counterpartyId?: string; caseId?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const suppliers = await db.select({ id: counterparties.id, name: counterparties.legalName }).from(counterparties).orderBy(asc(counterparties.legalName));
  const cpId = sp.counterpartyId && isUuid(sp.counterpartyId) ? sp.counterpartyId : "";
  const caseRows = cpId ? await db.select({ id: cases.id, reference: cases.reference }).from(cases).where(eq(cases.counterpartyId, cpId)) : [];
  return (
    <>
      <PageHeader title="Log bank details" back={{ href: "/payments", label: "Bank details" }} subtitle="Enter the instruction exactly as received. It stays unverified until confirmed and approved." />
      <Flash err={sp.err} />
      <form action={createInstructionAction} className="card grid gap-4 md:grid-cols-2">
        <Field label="Supplier" name="counterpartyId">
          <select id="counterpartyId" name="counterpartyId" className="input" defaultValue={cpId} required>
            <option value="" disabled>Choose supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Linked case (optional)" name="caseId">
          <select id="caseId" name="caseId" className="input" defaultValue={sp.caseId ?? ""}>
            <option value="">None</option>
            {caseRows.map((c) => <option key={c.id} value={c.id}>{c.reference}</option>)}
          </select>
        </Field>
        <Field label="Beneficiary name (as written)" name="beneficiaryName">
          <input id="beneficiaryName" name="beneficiaryName" className="input" required />
        </Field>
        <Field label="Bank or payment provider" name="bankName">
          <input id="bankName" name="bankName" className="input" required />
        </Field>
        <Field label="Branch" name="branch">
          <input id="branch" name="branch" className="input" />
        </Field>
        <Field label="Account number" name="account" hint="Encrypted on save. Only the last 4 digits are shown afterwards.">
          <input id="account" name="account" className="input font-mono" autoComplete="off" required />
        </Field>
        <Field label="Currency" name="currency">
          <input id="currency" name="currency" className="input" defaultValue="KES" maxLength={3} />
        </Field>
        <Field label="Requested effective date" name="requestedEffectiveDate">
          <input id="requestedEffectiveDate" name="requestedEffectiveDate" type="date" className="input" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Where did this instruction come from?" name="sourceDescription">
            <textarea id="sourceDescription" name="sourceDescription" className="input" rows={2} required placeholder="e.g. Email from accounts@supplier.co.ke to client finance, 3 Oct, attached letter on letterhead" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="isChange" /> This changes bank details the client already used for this supplier
        </label>
        <div><SubmitButton>Log instruction</SubmitButton></div>
      </form>
    </>
  );
}
