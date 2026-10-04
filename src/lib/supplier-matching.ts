export interface SupplierIdentity {
  id: string;
  legalName: string;
  country: string;
  registrationNumber: string | null;
  registrationAuthority?: string | null;
  kraPin: string | null;
  domain: string | null;
}

const identifier = (value: string | null | undefined) => value?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? "";
const name = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function domain(value: string | null): string {
  if (!value?.trim()) return "";
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

/** Candidates only: a matching name/domain can describe separate group companies. */
export function supplierMatches(subject: SupplierIdentity, rows: SupplierIdentity[]) {
  return rows.filter(row => row.id !== subject.id).flatMap(row => {
    const reasons: string[] = [];
    const sameCountry = row.country.toUpperCase() === subject.country.toUpperCase();
    if (sameCountry && subject.country.toUpperCase() === "KE" && identifier(subject.kraPin) && identifier(subject.kraPin) === identifier(row.kraPin)) reasons.push("Same KRA PIN");
    if (sameCountry && identifier(subject.registrationNumber) && identifier(subject.registrationNumber) === identifier(row.registrationNumber) &&
        (!subject.registrationAuthority || !row.registrationAuthority || name(subject.registrationAuthority) === name(row.registrationAuthority))) reasons.push("Same registration number");
    if (sameCountry && name(subject.legalName).length >= 4 && name(subject.legalName) === name(row.legalName)) reasons.push("Same recorded name");
    if (domain(subject.domain) && domain(subject.domain) === domain(row.domain)) reasons.push("Shared website domain");
    return reasons.length ? [{ supplier: row, reasons, strong: reasons.some(reason => reason === "Same KRA PIN" || reason === "Same registration number") }] : [];
  }).sort((a, b) => Number(b.strong) - Number(a.strong) || a.supplier.legalName.localeCompare(b.supplier.legalName));
}
