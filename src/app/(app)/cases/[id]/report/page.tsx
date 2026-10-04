import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { ReportView } from "@/components/report-view";
import { PrintButton } from "@/components/print-button";
import { loadCase } from "@/lib/cases";
import { todayNairobi } from "@/lib/format";
import { isUuid } from "@/lib/nav";
import { buildReportData, type ReportData } from "@/lib/report";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { reportMatches } from "@/lib/integrity";

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ r?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { r } = await searchParams;
  if (!isUuid(id)) notFound();
  const c = await loadCase(id);
  if (!c) notFound();

  const reportId = r && isUuid(r) ? r : (c.status === "RELEASED" || c.status === "CLOSED") ? c.reports[0]?.id : undefined;
  let data: ReportData;
  let released = false;
  let hash: string | undefined;
  if (reportId) {
    const [rep] = await db.select().from(reports).where(and(eq(reports.id, reportId), eq(reports.caseId, id)));
    if (!rep) notFound();
    if (!reportMatches(rep)) {
      await audit(user.id, "report.integrity_failed", { reportId }, id);
      return <div role="alert" className="card"><h1 className="font-semibold">Report integrity check failed</h1><p className="mt-2">Ask an administrator to restore the original report before sharing it.</p><Link href={`/cases/${id}`} className="mt-4 inline-block underline">Back to case</Link></div>;
    }
    data = rep.snapshot as ReportData;
    released = true;
    hash = rep.sha256;
    await audit(user.id, "report.viewed", { reportId }, id);
  } else {
    data = buildReportData(c, todayNairobi());
  }

  return (
    <>
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/cases/${id}`} className="text-sm text-muted hover:text-ink">← Back to case</Link>
        <PrintButton />
      </div>
      <ReportView data={data} released={released} hash={hash} />
    </>
  );
}
