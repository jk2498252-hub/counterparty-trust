import Link from "next/link";
import { OUTCOME_LABELS, FINDING_STATUS_LABELS } from "@/lib/layers";
import { STATUS_LABELS, type CaseStatus } from "@/lib/workflow";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/payments";

const tone = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  grey: "bg-slate-100 text-slate-700 ring-slate-200",
};
export type Tone = keyof typeof tone;

export function Badge({ children, color = "grey" }: { children: React.ReactNode; color?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone[color]}`}>{children}</span>;
}

export function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <Badge>No outcome yet</Badge>;
  const c: Tone =
    outcome === "VERIFIED_WITHIN_SCOPE" ? "green" : outcome === "VERIFIED_WITH_ISSUES" ? "blue" : outcome === "INSUFFICIENT_EVIDENCE" ? "amber" : "red";
  return <Badge color={c}>{OUTCOME_LABELS[outcome]}</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const c: Tone =
    status === "RELEASED" || status === "CLOSED"
      ? "green"
      : status === "READY_TO_RELEASE" || status === "AWAITING_HUMAN_QC"
        ? "blue"
        : status.startsWith("AWAITING")
          ? "amber"
          : status === "CANCELLED"
            ? "red"
            : "grey";
  return <Badge color={c}>{STATUS_LABELS[status as CaseStatus] ?? status}</Badge>;
}

export function FindingBadge({ status }: { status: string }) {
  const c: Tone =
    status === "VERIFIED" ? "green" : status === "PARTIALLY_VERIFIED" ? "blue" : status === "CONFLICTING" ? "red" : status === "NOT_STARTED" ? "grey" : "amber";
  return <Badge color={c}>{FINDING_STATUS_LABELS[status] ?? status}</Badge>;
}

export function PaymentBadge({ status }: { status: string }) {
  const c: Tone =
    status === "CONFIRMED_WITHIN_SCOPE" ? "green" : status === "FROZEN_PENDING_CONFIRMATION" ? "red" : status === "PROPOSED_UNVERIFIED" ? "amber" : "grey";
  return <Badge color={c}>{PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? status}</Badge>;
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-md border px-4 py-3 text-sm ${err ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {(err ?? ok)!.split("\n").map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-muted hover:text-ink">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Field({ label, name, children, hint }: { label: string; name?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
