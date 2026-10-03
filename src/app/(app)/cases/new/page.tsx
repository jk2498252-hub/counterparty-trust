import { asc } from "drizzle-orm";
import { db } from "@/db";
import { clients, counterparties } from "@/db/schema";
import { createCaseAction } from "@/app/actions/cases";
import { Field, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { economics } from "@/lib/env";
import { requireUser } from "@/lib/session";

export default async function NewCasePage({ searchParams }: { searchParams: Promise<{ err?: string; counterpartyId?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const [clientRows, supplierRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ id: counterparties.id, name: counterparties.legalName, pin: counterparties.kraPin }).from(counterparties).orderBy(asc(counterparties.legalName)),
  ]);
  return (
    <>
      <PageHeader title="New case" back={{ href: "/cases", label: "Cases" }} subtitle="Start with the decision. You can complete the details on the Intake tab." />
      <Flash err={sp.err} />
      <form action={createCaseAction} className="space-y-6">
        <section className="card grid gap-4 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">Client</h2>
          <Field label="Existing client" name="clientId">
            <select id="clientId" name="clientId" className="input" defaultValue="new">
              <option value="new">+ New client</option>
              {clientRows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="New client name" name="clientName">
            <input id="clientName" name="clientName" className="input" />
          </Field>
          <Field label="Client contact name" name="clientContactName">
            <input id="clientContactName" name="clientContactName" className="input" />
          </Field>
          <Field label="Client contact email" name="clientContactEmail">
            <input id="clientContactEmail" name="clientContactEmail" type="email" className="input" />
          </Field>
        </section>

        <section className="card grid gap-4 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">Supplier</h2>
          <Field label="Existing supplier" name="counterpartyId" hint="Reuse a profile from earlier cases">
            <select id="counterpartyId" name="counterpartyId" className="input" defaultValue={sp.counterpartyId ?? "new"}>
              <option value="new">+ New supplier</option>
              {supplierRows.map((s) => <option key={s.id} value={s.id}>{s.name}{s.pin ? ` (${s.pin})` : ""}</option>)}
            </select>
          </Field>
          <Field label="Supplier name as supplied" name="legalName">
            <input id="legalName" name="legalName" className="input" />
          </Field>
          <Field label="Registration number (if known)" name="registrationNumber">
            <input id="registrationNumber" name="registrationNumber" className="input font-mono" />
          </Field>
          <Field label="KRA PIN (if known)" name="kraPin">
            <input id="kraPin" name="kraPin" className="input font-mono uppercase" />
          </Field>
          <Field label="Website domain" name="domain">
            <input id="domain" name="domain" className="input" />
          </Field>
          <Field label="Sector" name="sector">
            <input id="sector" name="sector" className="input" />
          </Field>
        </section>

        <section className="card grid gap-4 md:grid-cols-2">
          <h2 className="font-semibold md:col-span-2">The decision</h2>
          <div className="md:col-span-2">
            <Field label="What decision does this review support?" name="decisionPurpose">
              <textarea id="decisionPurpose" name="decisionPurpose" className="input" rows={2} required placeholder="e.g. First 40% deposit to a new packaging supplier" />
            </Field>
          </div>
          <Field label="Service depth" name="depth">
            <select id="depth" name="depth" className="input" defaultValue="DIGITAL">
              <option value="DIGITAL">Digital (KES {economics.prices.DIGITAL.toLocaleString()})</option>
              <option value="ENHANCED">Enhanced (KES {economics.prices.ENHANCED.toLocaleString()})</option>
              <option value="EXTENDED">On-ground / extended (from KES {economics.prices.EXTENDED.toLocaleString()})</option>
            </select>
          </Field>
          <Field label="Agreed fee (KES)" name="feeKes" hint="Leave blank to use the standard price for the depth">
            <input id="feeKes" name="feeKes" className="input" inputMode="numeric" />
          </Field>
          <Field label="Goods or services" name="goodsServices">
            <input id="goodsServices" name="goodsServices" className="input" />
          </Field>
          <Field label="Decision owner" name="decisionOwner">
            <input id="decisionOwner" name="decisionOwner" className="input" />
          </Field>
          <Field label="Amount" name="amount">
            <input id="amount" name="amount" className="input" inputMode="decimal" />
          </Field>
          <Field label="Currency" name="currency">
            <input id="currency" name="currency" className="input" defaultValue="KES" maxLength={3} />
          </Field>
          <Field label="Expected payment date" name="expectedPaymentDate">
            <input id="expectedPaymentDate" name="expectedPaymentDate" type="date" className="input" />
          </Field>
        </section>
        <SubmitButton>Open case</SubmitButton>
      </form>
    </>
  );
}
