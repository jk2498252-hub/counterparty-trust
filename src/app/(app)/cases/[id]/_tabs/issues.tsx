import { addDiscrepancyAction, updateDiscrepancyAction } from "@/app/actions/cases";
import { Badge, Empty, Field } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";
import { DISCREPANCY_CODES } from "@/lib/layers";

const SEV = ["CONTEXTUAL", "MINOR", "MATERIAL", "CRITICAL"];
const STATES = ["OPEN", "AWAITING_EVIDENCE", "EXPLAINED", "RESOLVED", "ACCEPTED_WITH_LIMITATION", "ESCALATED"];
const nice = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");

export function IssuesTab({ c }: { c: LoadedCase }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Record each discrepancy with its effect on this decision. Severity is about consequence for the decision, not about the
        supplier&apos;s honesty. Mark an issue &quot;established&quot; only when reviewed evidence proves the contradiction; otherwise it stays a candidate.
      </p>
      {c.discrepancies.length ? (
        c.discrepancies.map((d) => (
          <section key={d.id} className="card">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold">{d.code}</span>
              <span className="text-sm">{DISCREPANCY_CODES[d.code]}</span>
              <Badge color={d.severity === "CRITICAL" || d.severity === "MATERIAL" ? "red" : "grey"}>{nice(d.severity)}</Badge>
              <Badge color={["RESOLVED", "EXPLAINED"].includes(d.state) ? "green" : "amber"}>{nice(d.state)}</Badge>
              {d.established ? <Badge color="red">Established</Badge> : <Badge>Candidate</Badge>}
            </div>
            <p className="mb-3 text-sm">{d.description}</p>
            <form action={updateDiscrepancyAction} className="grid gap-3 md:grid-cols-3">
              <input type="hidden" name="caseId" value={c.id} />
              <input type="hidden" name="id" value={d.id} />
              <select name="severity" className="input" defaultValue={d.severity}>
                {SEV.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
              </select>
              <select name="state" className="input" defaultValue={d.state}>
                {STATES.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="established" defaultChecked={d.established} /> Established by evidence
              </label>
              <textarea name="effect" className="input md:col-span-3" rows={2} defaultValue={d.effect ?? ""} placeholder="Effect on this decision" />
              <textarea name="explanation" className="input md:col-span-3" rows={2} defaultValue={d.explanation ?? ""} placeholder="Explanation or resolution (required to close)" />
              <div><SubmitButton className="btn-secondary">Update issue</SubmitButton></div>
            </form>
          </section>
        ))
      ) : (
        <Empty>No issues logged.</Empty>
      )}
      <section className="card">
        <h2 className="mb-4 font-semibold">Log an issue</h2>
        <form action={addDiscrepancyAction} className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="caseId" value={c.id} />
          <Field label="Type" name="code">
            <select id="code" name="code" className="input">
              {Object.entries(DISCREPANCY_CODES).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}
            </select>
          </Field>
          <Field label="Severity for this decision" name="severity">
            <select id="severity" name="severity" className="input" defaultValue="MINOR">
              {SEV.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input type="checkbox" name="established" /> Established by evidence
          </label>
          <div className="md:col-span-3">
            <Field label="What differs" name="description">
              <textarea id="description" name="description" className="input" rows={2} required placeholder="Exact field, entity, sources and dates on each side" />
            </Field>
          </div>
          <div className="md:col-span-3">
            <Field label="Effect on this decision" name="effect">
              <input id="effect" name="effect" className="input" />
            </Field>
          </div>
          <div><SubmitButton>Log issue</SubmitButton></div>
        </form>
      </section>
    </div>
  );
}
