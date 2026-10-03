export function kes(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return `KES ${Math.round(v).toLocaleString("en-KE")}`;
}

export function hours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} h`;
}

export function dateStr(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const v = typeof d === "string" ? new Date(d) : d;
  return v.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" });
}

export function dateTimeStr(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const v = typeof d === "string" ? new Date(d) : d;
  return v.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
}

export function todayNairobi(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
}

export function label(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}
