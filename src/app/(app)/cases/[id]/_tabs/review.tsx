import Link from "next/link";
import { validityExceptions } from "@/lib/source-rules";
import { releaseAction, reviewAction } from "@/app/actions/cases";
import { Badge, Empty } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { submitInputFor, type LoadedCase } from "@/lib/cases";
import { dateTimeStr } from "@/lib/format";
import type { SessionUser } from "@/lib/session";
import { QC_CHECKLIST, releaseBlockers, reviewBlockers, submitBlockers, type CaseStatus } from "@/lib/workflow";

export function ReviewTab({ c, user }: { c: LoadedCase; user: SessionUser }) {
  const reviewProblems = reviewBlockers({
    reviewerId: user.id,
    analystId: c.analystId,
    reviewerRole: user.role,
    reviewerAuthoredContent: c.authorIds.includes(user.id),
  });
  const latest = c.reviews[0];
  const releaseProblems = releaseBlockers({
    status: c.status as CaseStatus,
    caseVersion: c.version,
    analystId: c.analystId,
    releaserId: user.id,
    releaserRole: user.role,
    latestReview: latest ? { result: latest.result, caseVersion: latest.caseVersion, reviewerId: latest.reviewerId } : null,
    releaserAuthoredContent: c.authorIds.includes(user.id),
    contentBlockers: submitBlockers(submitInputFor(c)),
  });

  return (
    <div className="space-y-6">
      {c.status === "AWAITING_HUMAN_QC" &&
        (reviewProblems.length ? (
          <section className="card text-sm">
            <h2 className="mb-2 font-semibold">Waiting for an independent review</h2>
            <ul className="list-disc pl-5 text-muted">{reviewProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          </section>
        ) : (
          <section className="card">
            <h2 className="mb-1 font-semibold">Review version {c.version}</h2>
            <p className="mb-4 text-sm text-muted">
              Read the <Link href={`/cases/${c.id}/report`} className="underline">report preview</Link> and the evidence before ticking.
              Ask: could the client mistake this for payment approval? Could a missing record become an accusation?
            </p>
            {(() => {
              const exceptions = c.evidence.flatMap((e) =>
                c.findings.some((f) => f.evidenceIds.includes(e.id)) ? validityExceptions(e).map((x) => `${e.code} ${e.sourceName}: ${x}`) : [],
              );
              return exceptions.length ? (
                <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="mb-1 font-semibold">Source policy exceptions to check before passing</div>
                  <ul className="list-disc pl-5">{exceptions.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              ) : null;
            })()}
            <form action={reviewAction} className="space-y-4">
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="caseVersion" value={c.version} />
              <div className="space-y-2">
                {QC_CHECKLIST.map((q) => (
                  <label key={q.key} className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name={`qc_${q.key}`} className="mt-1" /> {q.label}
                  </label>
                ))}
              </div>
              <textarea name="defects" className="input" rows={3} placeholder="Defects the analyst must fix (required to return the case)" />
              <div className="flex gap-2">
                <SubmitButton name="result" value="PASS">Pass review</SubmitButton>
                <SubmitButton name="result" value="FAIL" className="btn-secondary">Return to analyst</SubmitButton>
              </div>
            </form>
          </section>
        ))}

      {c.status === "READY_TO_RELEASE" && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Release the report</h2>
          {releaseProblems.length ? (
            <ul className="list-disc pl-5 text-sm text-muted">{releaseProblems.map((p) => <li key={p}>{p}</li>)}</ul>
          ) : (
            <form action={releaseAction}>
              <input type="hidden" name="caseId" value={c.id} />
              <p className="mb-3 text-sm text-muted">
                Releasing freezes version {c.version} with a SHA-256 fingerprint. Later changes need a correction and a new review.
              </p>
              <SubmitButton confirm="Release this report to the client?">Release report</SubmitButton>
            </form>
          )}
        </section>
      )}

      {!["AWAITING_HUMAN_QC", "READY_TO_RELEASE"].includes(c.status) && (
        <p className="text-sm text-muted">
          The analyst sends the case for review once every layer is assessed and cited and an outcome is chosen.
        </p>
      )}

      <section className="card">
        <h2 className="mb-4 font-semibold">Released reports</h2>
        {c.reports.length ? (
          <table className="table">
            <thead><tr><th>Version</th><th>Released</th><th>By</th><th>Fingerprint (SHA-256)</th><th /></tr></thead>
            <tbody>
              {c.reports.map((r) => (
                <tr key={r.id}>
                  <td>v{r.caseVersion}</td>
                  <td>{dateTimeStr(r.createdAt)}</td>
                  <td>{c.userName(r.releasedById)}</td>
                  <td className="font-mono text-xs break-all">{r.sha256}</td>
                  <td><Link href={`/cases/${c.id}/report?r=${r.id}`} className="text-brand underline">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>Nothing released yet.</Empty>
        )}
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">Review history</h2>
        {c.reviews.length ? (
          <table className="table">
            <thead><tr><th>When</th><th>Reviewer</th><th>Version</th><th>Result</th><th>Defects</th></tr></thead>
            <tbody>
              {c.reviews.map((r) => (
                <tr key={r.id}>
                  <td>{dateTimeStr(r.createdAt)}</td>
                  <td>{c.userName(r.reviewerId)}</td>
                  <td>v{r.caseVersion}{r.caseVersion !== c.version && <span className="ml-1 text-xs text-muted">(outdated)</span>}</td>
                  <td><Badge color={r.result === "PASS" ? "green" : "amber"}>{r.result === "PASS" ? "Passed" : "Returned"}</Badge></td>
                  <td>{r.defects ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No reviews yet.</Empty>
        )}
      </section>
    </div>
  );
}
