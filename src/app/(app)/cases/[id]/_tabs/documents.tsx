import { uploadDocumentAction } from "@/app/actions/cases";
import { Empty, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";
import { dateStr, dateTimeStr } from "@/lib/format";
import { DOC_TYPES } from "@/lib/files";

export function DocumentsTab({ c }: { c: LoadedCase }) {
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-4 font-semibold">Documents</h2>
        {c.documents.length ? (
          <table className="table">
            <thead>
              <tr><th>Type</th><th>File</th><th>From</th><th>Received</th><th>Uploaded</th><th>Fingerprint</th></tr>
            </thead>
            <tbody>
              {c.documents.map((d) => (
                <tr key={d.id}>
                  <td>{d.docType}</td>
                  <td>
                    <a href={`/api/files/${d.id}`} className="text-brand underline">{d.originalName}</a>
                    <div className="text-xs text-muted">{Math.ceil(d.sizeBytes / 1024)} KB</div>
                  </td>
                  <td>{d.source ?? "—"}</td>
                  <td>{dateStr(d.receivedDate)}</td>
                  <td className="whitespace-nowrap">{dateTimeStr(d.createdAt)}<div className="text-xs text-muted">{c.userName(d.uploadedById)}</div></td>
                  <td className="font-mono text-xs" title={d.sha256}>{d.sha256.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No documents yet. Upload the original quote, invoice, certificates and payment instructions as received.</Empty>
        )}
      </section>
      <section className="card">
        <h2 className="mb-4 font-semibold">Upload a document</h2>
        <form action={uploadDocumentAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="caseId" value={c.id} />
          <Field label="File" name="file" hint="Original file as received. PDF, PNG, JPG, DOCX, XLSX, CSV, TXT, EML up to 15 MB.">
            <input id="file" name="file" type="file" className="input" required />
          </Field>
          <Field label="Document type" name="docType">
            <select id="docType" name="docType" className="input">
              {DOC_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Who sent it, and how" name="source">
            <input id="source" name="source" className="input" placeholder="e.g. emailed by supplier rep to client procurement" />
          </Field>
          <Field label="Date received" name="receivedDate">
            <input id="receivedDate" name="receivedDate" type="date" className="input" />
          </Field>
          <div><SubmitButton>Upload</SubmitButton></div>
        </form>
        <p className="mt-3 text-xs text-muted">
          Files are checked by type, stored privately and fingerprinted. They are not virus-scanned yet: open unexpected files with care.
        </p>
      </section>
    </div>
  );
}
