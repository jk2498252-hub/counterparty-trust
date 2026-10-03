import { Empty } from "@/components/ui";
import { dateTimeStr } from "@/lib/format";
import type { loadAudit } from "@/lib/cases";

export function HistoryTab({ rows }: { rows: Awaited<ReturnType<typeof loadAudit>> }) {
  if (!rows.length) return <Empty>No history yet.</Empty>;
  return (
    <section className="card">
      <h2 className="mb-4 font-semibold">Audit trail</h2>
      <table className="table">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>Detail</th></tr></thead>
        <tbody>
          {rows.map(({ e, actor }) => (
            <tr key={e.id}>
              <td className="whitespace-nowrap">{dateTimeStr(e.createdAt)}</td>
              <td>{actor ?? "System"}</td>
              <td className="font-mono text-xs">{e.action}</td>
              <td className="text-xs text-muted">
                {e.detail ? Object.entries(e.detail).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ") : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
