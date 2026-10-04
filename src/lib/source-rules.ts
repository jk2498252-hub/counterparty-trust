// What kind of source can support each check, and how long standard sources stay valid.
// Encodes the operating manual: identity needs an official register, authority and
// bank details need independent confirmation, and the supplier's own word is never enough.

import type { Layer } from "./layers";

export type SourceCategory =
  | "AUTHORITATIVE"
  | "FIRST_PARTY"
  | "CLIENT_SUPPLIED"
  | "INDEPENDENT_CONFIRMATION"
  | "THIRD_PARTY"
  | "UNVERIFIED";

export const CATEGORY_LABELS: Record<SourceCategory, string> = {
  AUTHORITATIVE: "Authoritative (official register)",
  INDEPENDENT_CONFIRMATION: "Independent confirmation",
  FIRST_PARTY: "First-party (supplier's own)",
  CLIENT_SUPPLIED: "Client-supplied",
  THIRD_PARTY: "Third-party",
  UNVERIFIED: "Unverified",
};

/** A source labelled "unverified" can never support a positive finding. */
export const NEVER_SUPPORTS: SourceCategory[] = ["UNVERIFIED"];

interface RequirementGroup {
  label: string;
  categories: SourceCategory[];
}

/**
 * Every group must be met by at least one current, examined source cited by the finding.
 * (One source can only meet a group its category is listed in.)
 */
export const LAYER_SOURCE_REQUIREMENTS: Record<Layer, RequirementGroup[]> = {
  LEGAL_IDENTITY: [{ label: "an official register (Authoritative), e.g. a BRS search", categories: ["AUTHORITATIVE"] }],
  TAX_COMPLIANCE: [{ label: "an official KRA result (Authoritative), e.g. the PIN or TCC checker", categories: ["AUTHORITATIVE"] }],
  DIGITAL_IDENTITY: [
    { label: "a source other than the supplier itself (Authoritative, Independent or Third-party)", categories: ["AUTHORITATIVE", "INDEPENDENT_CONFIRMATION", "THIRD_PARTY"] },
  ],
  REPRESENTATIVE_AUTHORITY: [{ label: "an independent confirmation through a separately found contact", categories: ["INDEPENDENT_CONFIRMATION"] }],
  OPERATIONAL_EXISTENCE: [
    { label: "a source other than the supplier itself (Authoritative, Independent or Third-party)", categories: ["AUTHORITATIVE", "INDEPENDENT_CONFIRMATION", "THIRD_PARTY"] },
  ],
  DOCUMENT_CONSISTENCY: [
    { label: "the client-supplied documents being checked", categories: ["CLIENT_SUPPLIED"] },
    { label: "an official record to check them against (Authoritative)", categories: ["AUTHORITATIVE"] },
  ],
  TRANSACTION_BENEFICIARY: [{ label: "an independent confirmation of the bank details", categories: ["INDEPENDENT_CONFIRMATION"] }],
};

/** Which requirement groups the cited, usable sources fail to meet. */
export function supportGaps(layer: Layer, usableCategories: string[]): string[] {
  return LAYER_SOURCE_REQUIREMENTS[layer]
    .filter((g) => !usableCategories.some((c) => (g.categories as string[]).includes(c)))
    .map((g) => g.label);
}

// ---------- Standard validity catalogue ----------

export interface SourceStandard {
  name: string;
  category: SourceCategory;
  /** Recheck this many days after the check date. */
  recheckDays: number;
  /** The source carries its own expiry date (e.g. a certificate) that should be recorded. */
  hasOwnExpiry?: boolean;
  basis: string;
}

export const SOURCE_CATALOGUE: SourceStandard[] = [
  { name: "BRS official company search (CR12)", category: "AUTHORITATIVE", recheckDays: 30, basis: "Standard policy: registry searches are refreshed after 30 days or any change." },
  { name: "BRS business name search (CR13)", category: "AUTHORITATIVE", recheckDays: 30, basis: "Standard policy: registry searches are refreshed after 30 days or any change." },
  { name: "KRA iTax PIN checker", category: "AUTHORITATIVE", recheckDays: 30, basis: "Standard policy: PIN status is rechecked after 30 days." },
  { name: "KRA iTax TCC checker", category: "AUTHORITATIVE", recheckDays: 30, hasOwnExpiry: true, basis: "Standard policy: TCC rechecked after 30 days; record the certificate's own expiry." },
  { name: "KRA eTIMS invoice checker", category: "AUTHORITATIVE", recheckDays: 90, basis: "Standard policy: an invoice check covers this transaction for 90 days." },
  { name: "Independent call to registered contact", category: "INDEPENDENT_CONFIRMATION", recheckDays: 30, basis: "Standard policy: independent confirmations cover this transaction for 30 days." },
  { name: "County business permit", category: "AUTHORITATIVE", recheckDays: 90, hasOwnExpiry: true, basis: "Standard policy: rechecked after 90 days; record the permit's own expiry." },
  { name: "PPIP public procurement awards", category: "AUTHORITATIVE", recheckDays: 180, basis: "Standard policy: procurement history rechecked after 180 days." },
  { name: "KENIC .ke WHOIS", category: "THIRD_PARTY", recheckDays: 90, basis: "Standard policy: domain records rechecked after 90 days." },
  { name: "Client-supplied invoice", category: "CLIENT_SUPPLIED", recheckDays: 90, basis: "Standard policy: client documents cover this transaction for 90 days." },
  { name: "Client-supplied bank letter", category: "CLIENT_SUPPLIED", recheckDays: 30, basis: "Standard policy: bank letters cover this transaction for 30 days." },
];

/** Longest any recorded validity may run past the check date before it is treated as a mistake. */
export const MAX_VALIDITY_DAYS = 3 * 366;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export function findStandard(sourceName: string): SourceStandard | undefined {
  return SOURCE_CATALOGUE.find((s) => norm(s.name) === norm(sourceName));
}

export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The standard recheck date and basis for a known source, used when the analyst sets none. */
export function standardValidity(sourceName: string, checkedDate: string): { recheckOn: string; validityNote: string } | null {
  const s = findStandard(sourceName);
  return s ? { recheckOn: addDays(checkedDate, s.recheckDays), validityNote: s.basis } : null;
}

/**
 * Explains how a source's recorded validity departs from the standard catalogue.
 * Exceptions are allowed, but the reviewer sees each one before approving.
 */
export function validityExceptions(e: {
  sourceName: string;
  category: string;
  accessResult: string;
  checkedDate: string;
  validUntil?: string | null;
  recheckOn?: string | null;
}): string[] {
  if (e.accessResult !== "EXAMINED") return [];
  const s = findStandard(e.sourceName);
  if (!s) return ["Not a standard source: the reviewer must accept the stated validity basis."];
  const out: string[] = [];
  const limit = addDays(e.checkedDate, s.recheckDays);
  if (e.recheckOn && e.recheckOn > limit) out.push(`Recheck date is later than the standard ${s.recheckDays} days (${limit}).`);
  if (!e.recheckOn && e.validUntil && e.validUntil > limit) out.push(`Relies on the source's own expiry instead of the standard ${s.recheckDays}-day recheck.`);
  if (s.hasOwnExpiry && !e.validUntil) out.push("The source's own expiry date is not recorded.");
  if (e.category !== s.category) out.push(`Category recorded as ${e.category.toLowerCase().replace(/_/g, " ")}; standard is ${s.category.toLowerCase().replace(/_/g, " ")}.`);
  return out;
}
