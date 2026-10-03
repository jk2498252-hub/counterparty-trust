import { setOutcomeAction } from "@/app/actions/cases";
import { OutcomeBadge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";
import { OUTCOME_LABELS, titled } from "@/lib/layers";
import { isOutcomeAllowed, OUTCOME_RANK, suggestOutcome, type Outcome } from "@/lib/outcome";

const MEANING: Record<Outcome, string> = {
  VERIFIED_WITHIN_SCOPE: "Every critical claim is established and nothing material is open. State scope, date and exclusions.",
  VERIFIED_WITH_ISSUES: "Critical claims are established; named non-critical issues remain, each with its next action.",
  INSUFFICIENT_EVIDENCE: "One or more critical claims could not be established. Name what is missing and the next check. Not an accusation.",
  MATERIAL_RED_FLAGS: "An established material contradiction is unresolved. Describe it exactly. Never allege fraud.",
};

export function OutcomeTab({ c }: { c: LoadedCase }) {
  const s = suggestOutcome(titled(c.findings), c.discrepancies);
  const options = (Object.keys(OUTCOME_RANK) as Outcome[]).sort((a, b) => OUTCOME_RANK[b] - OUTCOME_RANK[a]);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="card lg:col-span-2">
        <h2 className="mb-4 font-semibold">Outcome</h2>
        <form action={setOutcomeAction} className="space-y-4">
          <input type="hidden" name="caseId" value={c.id} />
          <fieldset className="space-y-2">
            {options.map((o) => {
              const allowed = isOutcomeAllowed(o, s.outcome);
              return (
                <label key={o} className={`flex gap-3 rounded-md border p-3 text-sm ${allowed ? "border-line" : "border-line opacity-40"}`}>
                  <input type="radio" name="outcome" value={o} defaultChecked={c.outcome === o} disabled={!allowed} className="mt-1" />
                  <span>
                    <span className="font-semibold">{OUTCOME_LABELS[o]}</span>
                    <span className="block text-muted">{MEANING[o]}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
          <div>
            <label className="label">Summary for the client</label>
            <textarea
              name="outcomeSummary"
              className="input"
              rows={4}
              defaultValue={c.outcomeSummary ?? ""}
              placeholder="One paragraph: what is established, for which entity, as of which date, and what is not."
            />
          </div>
          <div>
            <label className="label">Next steps</label>
            <textarea name="nextSteps" className="input" rows={3} defaultValue={c.nextSteps ?? ""} placeholder="Concrete checks that would close each gap" />
          </div>
          <SubmitButton>Save outcome</SubmitButton>
        </form>
      </section>
      <section className="card text-sm">
        <h2 className="mb-2 font-semibold">What the evidence allows</h2>
        <div className="mb-3"><OutcomeBadge outcome={s.outcome} /></div>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          {s.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="mt-4 text-xs text-muted">
          You can choose this outcome or a more cautious one, never a better one. Material red flags is only available when an
          established contradiction or conflicting critical finding supports it. There is no score: the outcome follows the
          critical claims and open issues.
        </p>
      </section>
    </div>
  );
}
