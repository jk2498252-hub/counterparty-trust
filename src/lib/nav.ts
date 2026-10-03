import { redirect } from "next/navigation";

/** Redirect back to a page with a flash message. */
export function back(path: string, msg: { ok?: string; err?: string }): never {
  const url = new URL(path, "http://x");
  if (msg.ok) url.searchParams.set("ok", msg.ok);
  if (msg.err) url.searchParams.set("err", msg.err);
  redirect(url.pathname + url.search);
}

export function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v === "" ? null : v;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

export function int(fd: FormData, key: string): number | null {
  const v = str(fd, key).replace(/[, ]/g, "");
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: string): boolean {
  return UUID.test(v);
}
