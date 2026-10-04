import Link from "next/link";
import { updateFindingAction } from "@/app/actions/cases";
import { FindingBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";
import { FINDING_STATUS_LABELS, LAYER_DEFINITIONS } from "@/lib/layers";
import { findingSupportGaps } from "@/lib/evidence-policy";
import { CATEGORY_LABELS, LAYER_SOURCE_REQUIREMENTS, type SourceCategory } from "@/lib/source-rules";

export function ChecksTab({ c }: { c: LoadedCase }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Assess each layer, write what the evidence shows, and cite the evidence that supports it. Uncited findings cannot be
        released. Log sources first under <Link className="underline" href={`/cases/${c.id}?tab=evidence`}>Evidence</Link>.
      </p>
      {c.findings.map((f) => {
        const def = LAYER_DEFINITIONS[f.layer];
        return (
          <section key={f.id} id={f.layer} className="card scroll-mt-6">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">
                  {def.title}
                  {f.critical && <span className="ml-2 text-xs font-semibold text-red-700">critical</span>}
                </h2>
                <p className="text-sm text-muted">{def.question}</p>
              </div>
              <FindingBadge status={f.status} />
            </div>

            <p className="mb-3 text-sm">
              <span className="font-medium">To mark this Verified, cite:</span>{" "}
              {LAYER_SOURCE_REQUIREMENTS[f.layer].map((g) => g.label).join(", and ")}. Sources labelled Unverified never count.
            </p>
            {(f.status === "VERIFIED" || f.status === "PARTIALLY_VERIFIED") && findingSupportGaps(f, c.evidence).length > 0 && (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Still missing: {findingSupportGaps(f, c.evidence).join(", and ")}. Until then this counts as unresolved.
              </p>
            )}
            <details className="mb-4 rounded-md bg-paper p-3 text-sm">
              <summary className="cursor-pointer font-medium">What to check</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {def.checks.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <p className="mt-3 font-medium">Be careful</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                {def.cautions.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </details>

            {f.layer === "TRANSACTION_BENEFICIARY" && !c.payments.some((p) => p.status === "CONFIRMED_WITHIN_SCOPE") && (
              <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                No bank details on this case are confirmed yet. This layer can only be marked Verified once they are, under{" "}
                <Link className="underline" href={`/cases/${c.id}?tab=bank`}>Bank details</Link>.
              </p>
            )}
            <form action={updateFindingAction} className="space-y-3">
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="findingId" value={f.id} />
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="label">Result</label>
                  <select name="status" className="input" defaultValue={f.status}>
                    {Object.entries(FINDING_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Confidence in this finding</label>
                  <select name="confidence" className="input" defaultValue={f.confidence}>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                    <option value="NOT_ASSESSED">Not assessed</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 pt-5 text-sm">
                  <input type="checkbox" name="critical" defaultChecked={f.critical} /> Critical for this decision
                </label>
              </div>
              {def.criticalByDefault && (
                <input
                  name="scopeChangeNote"
                  className="input"
                  defaultValue={f.scopeChangeNote ?? ""}
                  placeholder="Only if un-ticking 'critical': record the client's agreement to narrow the scope"
                />
              )}
              <div>
                <label className="label">Finding</label>
                <textarea
                  name="finding"
                  className="input"
                  rows={3}
                  defaultValue={f.finding ?? ""}
                  placeholder="State exactly what the evidence shows, for which entity and as of which date. Name what is missing."
                />
              </div>
              <div>
                <label className="label">Evidence cited</label>
                {c.evidence.length ? (
                  <div className="grid gap-1 md:grid-cols-2">
                    {c.evidence.map((e) => (
                      <label key={e.id} className="flex items-start gap-2 text-sm">
                        <input type="checkbox" name="evidenceIds" value={e.id} defaultChecked={f.evidenceIds.includes(e.id)} className="mt-1" />
                        <span>
                          <span className="font-mono font-semibold">{e.code}</span> {e.sourceName}
                          <span className="text-muted"> · {CATEGORY_LABELS[e.category as SourceCategory] ?? e.category} · {e.accessResult.toLowerCase().replace(/_/g, " ")}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">No evidence logged yet.</p>
                )}
              </div>
              <SubmitButton className="btn-secondary">Save {def.title.toLowerCase()}</SubmitButton>
            </form>
          </section>
        );
      })}
    </div>
  );
}
