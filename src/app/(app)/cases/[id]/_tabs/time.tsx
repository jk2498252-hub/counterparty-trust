import { addTimeAction, deleteTimeAction } from "@/app/actions/cases";
import { Empty } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { LoadedCase } from "@/lib/cases";
import { dateStr, hours, label, todayNairobi } from "@/lib/format";
import type { SessionUser } from "@/lib/session";

export function TimeTab({ c, user }: { c: LoadedCase; user: SessionUser }) {
  const total = c.timeEntries.reduce((s, t) => s + t.minutes, 0);
  const qc = c.timeEntries.filter((t) => t.activity === "QC").reduce((s, t) => s + t.minutes, 0);
  return (
    <div className="space-y-6">
      <section className="card">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Time on this case</h2>
          <span className="text-sm text-muted">Total {hours(total)} · analysis {hours(total - qc)} · review {hours(qc)}</span>
        </div>
        {c.timeEntries.length ? (
          <table className="table">
            <thead><tr><th>Date</th><th>Who</th><th>Activity</th><th>Time</th><th>Note</th><th /></tr></thead>
            <tbody>
              {c.timeEntries.map((t) => (
                <tr key={t.id}>
                  <td>{dateStr(t.workDate)}</td>
                  <td>{c.userName(t.userId)}</td>
                  <td>{label(t.activity)}</td>
                  <td>{hours(t.minutes)}</td>
                  <td>{t.note ?? ""}</td>
                  <td>
                    {(t.userId === user.id || user.role === "ADMIN") && (
                      <form action={deleteTimeAction}>
                        <input type="hidden" name="caseId" value={c.id} />
                        <input type="hidden" name="id" value={t.id} />
                        <SubmitButton className="text-xs text-red-700 underline">Remove</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No time logged. Logging time on every case is how the pilot proves its real cost.</Empty>
        )}
      </section>
      <section className="card">
        <h2 className="mb-4 font-semibold">Log time</h2>
        <form action={addTimeAction} className="grid items-end gap-3 md:grid-cols-6">
          <input type="hidden" name="caseId" value={c.id} />
          <div><label className="label">Date</label><input type="date" name="workDate" className="input" defaultValue={todayNairobi()} /></div>
          <div><label className="label">Hours</label><input name="hours" className="input" inputMode="decimal" placeholder="1.5" /></div>
          <div><label className="label">Minutes</label><input name="minutes" className="input" inputMode="numeric" placeholder="0" /></div>
          <div>
            <label className="label">Activity</label>
            <select name="activity" className="input" defaultValue={user.role === "REVIEWER" ? "QC" : "SOURCE_CHECKS"}>
              <option value="INTAKE">Intake</option>
              <option value="SOURCE_CHECKS">Source checks</option>
              <option value="ANALYSIS">Analysis</option>
              <option value="CLIENT_COMMS">Client comms</option>
              <option value="REPORT">Report writing</option>
              <option value="QC">Review (QC)</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div><label className="label">Note</label><input name="note" className="input" /></div>
          <div><SubmitButton className="btn-secondary">Add</SubmitButton></div>
        </form>
      </section>
    </div>
  );
}
