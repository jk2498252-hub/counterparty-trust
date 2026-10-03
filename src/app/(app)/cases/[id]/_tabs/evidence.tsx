import { addEvidenceAction, deleteEvidenceAction } from "@/app/actions/cases";
import { Empty, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";
import { dateStr, label, todayNairobi } from "@/lib/format";

export function EvidenceTab({ c }: { c: LoadedCase }) {
  const citedBy = (id: string) => c.findings.filter((f) => f.evidenceIds.includes(id)).length;
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-1 font-semibold">Evidence register</h2>
        <p className="mb-4 text-sm text-muted">
          Log every source you examined, including the ones you could not access. A failed or unavailable source is a recorded gap,
          never a negative finding.
        </p>
        {c.evidence.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Source</th><th>Category</th><th>Access</th><th>Checked</th><th>What it shows</th><th>Cited</th><th /></tr>
              </thead>
              <tbody>
                {c.evidence.map((e) => (
                  <tr key={e.id}>
                    <td className="font-mono font-semibold">{e.code}</td>
                    <td>
                      <div className="font-medium">{e.sourceName}</div>
                      {e.authority && <div className="text-xs text-muted">{e.authority}</div>}
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="text-xs text-brand underline break-all">
                          link
                        </a>
                      )}
                      {e.documentId && (
                        <a href={`/api/files/${e.documentId}`} className="ml-2 text-xs text-brand underline">file</a>
                      )}
                      {e.locator && <div className="text-xs text-muted">At: {e.locator}</div>}
                    </td>
                    <td>{label(e.category)}</td>
                    <td>{label(e.accessResult)}</td>
                    <td className="whitespace-nowrap">{dateStr(e.checkedDate)}</td>
                    <td className="max-w-sm">{e.summary}<div className="text-xs text-muted">Confidence: {label(e.confidence)}</div></td>
                    <td>{citedBy(e.id)}</td>
                    <td>
                      <form action={deleteEvidenceAction}>
                        <input type="hidden" name="caseId" value={c.id} />
                        <input type="hidden" name="id" value={e.id} />
                        <SubmitButton className="text-xs text-red-700 underline" confirm={`Remove ${e.code}? Findings citing it will lose the citation.`}>
                          Remove
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No evidence logged yet.</Empty>
        )}
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">Log evidence</h2>
        <form action={addEvidenceAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="caseId" value={c.id} />
          <Field label="Source" name="sourceName" hint="e.g. BRS official search (CR12), KRA TCC checker">
            <input id="sourceName" name="sourceName" className="input" required list="common-sources" />
            <datalist id="common-sources">
              <option value="BRS official company search (CR12)" />
              <option value="BRS business name search (CR13)" />
              <option value="KRA iTax PIN checker" />
              <option value="KRA iTax TCC checker" />
              <option value="KRA eTIMS invoice checker" />
              <option value="KENIC .ke WHOIS" />
              <option value="County business permit" />
              <option value="PPIP public procurement awards" />
              <option value="Independent call to registered contact" />
              <option value="Client-supplied invoice" />
              <option value="Client-supplied bank letter" />
            </datalist>
          </Field>
          <Field label="Issuing authority" name="authority">
            <input id="authority" name="authority" className="input" placeholder="e.g. Business Registration Service" />
          </Field>
          <Field label="Category" name="category">
            <select id="category" name="category" className="input" defaultValue="AUTHORITATIVE">
              <option value="AUTHORITATIVE">Authoritative (official register)</option>
              <option value="INDEPENDENT_CONFIRMATION">Independent confirmation</option>
              <option value="FIRST_PARTY">First-party (supplier&apos;s own)</option>
              <option value="CLIENT_SUPPLIED">Client-supplied</option>
              <option value="THIRD_PARTY">Third-party</option>
              <option value="UNVERIFIED">Unverified</option>
            </select>
          </Field>
          <Field label="Access result" name="accessResult">
            <select id="accessResult" name="accessResult" className="input" defaultValue="EXAMINED">
              <option value="EXAMINED">Examined</option>
              <option value="ACCESS_REQUIRED">Access required (paid / login / eligibility)</option>
              <option value="RETRIEVAL_FAILED">Retrieval failed</option>
              <option value="NOT_SUPPLIED">Not supplied by client</option>
            </select>
          </Field>
          <Field label="Date checked" name="checkedDate">
            <input id="checkedDate" name="checkedDate" type="date" className="input" defaultValue={todayNairobi()} />
          </Field>
          <Field label="Confidence" name="confidence">
            <select id="confidence" name="confidence" className="input" defaultValue="MEDIUM">
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="NOT_ASSESSED">Not assessed</option>
            </select>
          </Field>
          <Field label="Link" name="url">
            <input id="url" name="url" className="input" placeholder="https://" />
          </Field>
          <Field label="Where in the source" name="locator" hint="Page, section, receipt number">
            <input id="locator" name="locator" className="input" />
          </Field>
          <div className="md:col-span-2">
            <Field label="What it shows" name="summary">
              <textarea id="summary" name="summary" className="input" rows={2} required placeholder="Facts only: name, number, status, date. No conclusions." />
            </Field>
          </div>
          <Field label="Capture or receipt (optional)" name="file" hint="PDF, PNG, JPG, DOCX, XLSX, CSV, TXT, EML up to 15 MB">
            <input id="file" name="file" type="file" className="input" />
          </Field>
          <Field label="Or link an uploaded document" name="documentId">
            <select id="documentId" name="documentId" className="input" defaultValue="">
              <option value="">None</option>
              {c.documents.map((d) => (
                <option key={d.id} value={d.id}>{d.docType}: {d.originalName}</option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Use rights note" name="rightsNote" hint="Can we keep a copy or show it to the client?">
              <input id="rightsNote" name="rightsNote" className="input" />
            </Field>
          </div>
          <div><SubmitButton>Log evidence</SubmitButton></div>
        </form>
      </section>
    </div>
  );
}
