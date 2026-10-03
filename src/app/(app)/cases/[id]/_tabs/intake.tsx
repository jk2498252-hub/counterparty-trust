import { addRepresentativeAction, deleteRepresentativeAction, updateIntakeAction } from "@/app/actions/cases";
import { Empty, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";

export function IntakeTab({ c }: { c: LoadedCase }) {
  const cp = c.counterparty;
  return (
    <div className="space-y-6">
      <form action={updateIntakeAction} className="space-y-6">
        <input type="hidden" name="caseId" value={c.id} />
        <section className="card">
          <h2 className="mb-4 font-semibold">1. The decision</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="What decision does this review support?" name="decisionPurpose">
                <textarea id="decisionPurpose" name="decisionPurpose" className="input" rows={2} defaultValue={c.decisionPurpose} required />
              </Field>
            </div>
            <Field label="Service depth" name="depth">
              <select id="depth" name="depth" className="input" defaultValue={c.depth}>
                <option value="DIGITAL">Digital</option>
                <option value="ENHANCED">Enhanced</option>
                <option value="EXTENDED">On-ground / extended</option>
              </select>
            </Field>
            <Field label="Goods or services" name="goodsServices">
              <input id="goodsServices" name="goodsServices" className="input" defaultValue={c.goodsServices ?? ""} />
            </Field>
            <Field label="Amount" name="amount">
              <input id="amount" name="amount" className="input" inputMode="decimal" defaultValue={c.amount ?? ""} />
            </Field>
            <Field label="Currency" name="currency">
              <input id="currency" name="currency" className="input" maxLength={3} defaultValue={c.currency} />
            </Field>
            <Field label="Expected payment date" name="expectedPaymentDate">
              <input id="expectedPaymentDate" name="expectedPaymentDate" type="date" className="input" defaultValue={c.expectedPaymentDate ?? ""} />
            </Field>
            <Field label="Decision owner (who approves payment)" name="decisionOwner">
              <input id="decisionOwner" name="decisionOwner" className="input" defaultValue={c.decisionOwner ?? ""} />
            </Field>
            <Field label="Requester name" name="requesterName">
              <input id="requesterName" name="requesterName" className="input" defaultValue={c.requesterName ?? ""} />
            </Field>
            <Field label="Requester email" name="requesterEmail">
              <input id="requesterEmail" name="requesterEmail" type="email" className="input" defaultValue={c.requesterEmail ?? ""} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isNewSupplier" defaultChecked={c.isNewSupplier} /> New supplier for this client
            </label>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">2. The supplier</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Exact legal name" name="legalName">
              <input id="legalName" name="legalName" className="input" defaultValue={cp.legalName} required />
            </Field>
            <Field label="Entity type" name="entityType" hint="e.g. private company, business name, PLC">
              <input id="entityType" name="entityType" className="input" defaultValue={cp.entityType ?? ""} />
            </Field>
            <Field label="Registration number" name="registrationNumber" hint="Keep leading zeros exactly as issued">
              <input id="registrationNumber" name="registrationNumber" className="input font-mono" defaultValue={cp.registrationNumber ?? ""} />
            </Field>
            <Field label="Issued by" name="registrationAuthority">
              <input id="registrationAuthority" name="registrationAuthority" className="input" defaultValue={cp.registrationAuthority ?? "BRS Kenya"} />
            </Field>
            <Field label="KRA PIN" name="kraPin">
              <input id="kraPin" name="kraPin" className="input font-mono uppercase" defaultValue={cp.kraPin ?? ""} />
            </Field>
            <Field label="Website domain" name="domain">
              <input id="domain" name="domain" className="input" placeholder="example.co.ke" defaultValue={cp.domain ?? ""} />
            </Field>
            <Field label="Trading or former names" name="tradingNames">
              <input id="tradingNames" name="tradingNames" className="input" defaultValue={cp.tradingNames ?? ""} />
            </Field>
            <Field label="Sector" name="sector">
              <input id="sector" name="sector" className="input" defaultValue={cp.sector ?? ""} />
            </Field>
            <Field label="Registered address" name="registeredAddress">
              <textarea id="registeredAddress" name="registeredAddress" className="input" rows={2} defaultValue={cp.registeredAddress ?? ""} />
            </Field>
            <Field label="Operating address" name="operatingAddress">
              <textarea id="operatingAddress" name="operatingAddress" className="input" rows={2} defaultValue={cp.operatingAddress ?? ""} />
            </Field>
          </div>
        </section>

        <section className="card">
          <h2 className="mb-4 font-semibold">3. Permission and scope</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-start gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="commissioningAuthorityConfirmed" defaultChecked={c.commissioningAuthorityConfirmed} className="mt-1" />
              <span>
                <strong>The client is authorised to commission this review and share these documents.</strong> This is not the
                same as consent from the people named in them.
              </span>
            </label>
            <Field label="Who we may contact" name="permittedContacts">
              <textarea id="permittedContacts" name="permittedContacts" className="input" rows={2} defaultValue={c.permittedContacts ?? ""} />
            </Field>
            <Field label="Lawful basis / data handling note" name="lawfulBasisNote">
              <textarea id="lawfulBasisNote" name="lawfulBasisNote" className="input" rows={2} defaultValue={c.lawfulBasisNote ?? ""} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Excluded from scope" name="exclusions" hint="Shown on the report, e.g. site visit, sanctions screening, beneficial ownership">
                <textarea id="exclusions" name="exclusions" className="input" rows={2} defaultValue={c.exclusions ?? ""} />
              </Field>
            </div>
            <Field label="Agreed fee (KES)" name="feeKes">
              <input id="feeKes" name="feeKes" className="input" inputMode="numeric" defaultValue={c.feeKes ?? ""} />
            </Field>
            <Field label="Direct costs so far (KES)" name="directCostsKes" hint="Registry searches, data fees, travel">
              <input id="directCostsKes" name="directCostsKes" className="input" inputMode="numeric" defaultValue={c.directCostsKes} />
            </Field>
          </div>
        </section>
        <SubmitButton>Save intake</SubmitButton>
      </form>

      <section className="card">
        <h2 className="mb-4 font-semibold">4. Supplier representatives</h2>
        {c.representatives.length ? (
          <table className="table mb-4">
            <thead>
              <tr><th>Name</th><th>Claimed role</th><th>Contact</th><th>Introduced via</th><th>Mandate evidence</th><th /></tr>
            </thead>
            <tbody>
              {c.representatives.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td>{r.claimedRole ?? "—"}</td>
                  <td>{[r.email, r.phone].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{r.howIntroduced ?? "—"}</td>
                  <td>{r.mandateEvidence ?? "—"}</td>
                  <td>
                    <form action={deleteRepresentativeAction}>
                      <input type="hidden" name="caseId" value={c.id} />
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton className="text-xs text-red-700 underline" confirm="Remove this representative?">Remove</SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mb-4"><Empty>No representative recorded.</Empty></div>
        )}
        <form action={addRepresentativeAction} className="grid gap-3 md:grid-cols-3">
          <input type="hidden" name="caseId" value={c.id} />
          <input name="name" className="input" placeholder="Name" required />
          <input name="claimedRole" className="input" placeholder="Claimed role" />
          <input name="email" className="input" placeholder="Email" />
          <input name="phone" className="input" placeholder="Phone" />
          <input name="howIntroduced" className="input" placeholder="How introduced" />
          <input name="mandateEvidence" className="input" placeholder="Authority document, if any" />
          <div><SubmitButton className="btn-secondary">Add representative</SubmitButton></div>
        </form>
        <p className="mt-3 text-xs text-muted">Do not record national ID numbers or home addresses unless the scope requires it.</p>
      </section>
    </div>
  );
}
