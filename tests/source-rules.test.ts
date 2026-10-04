import { describe, expect, it } from "vitest";
import { caseReadinessBlockers, caseSuggestion } from "@/lib/case-readiness";
import { evidenceState } from "@/lib/evidence-policy";
import { LAYERS } from "@/lib/layers";
import { standardValidity, supportGaps, validityExceptions } from "@/lib/source-rules";

const TODAY = "2026-10-04";
const ev = (id: string, category: string, extra: Record<string, unknown> = {}) => ({
  id, category, accessResult: "EXAMINED", checkedDate: "2026-10-01", validUntil: null, recheckOn: "2026-10-30", validityNote: "standard", ...extra,
});
function caseWith(evidence: ReturnType<typeof ev>[], cite: (layer: string) => string[]) {
  return {
    findings: LAYERS.map((layer) => ({ layer, status: "VERIFIED", critical: true, finding: "ok", evidenceIds: cite(layer) })),
    evidence, discrepancies: [], outcome: "VERIFIED_WITHIN_SCOPE", outcomeSummary: "ok",
    commissioningAuthorityConfirmed: true, analystId: "a", payments: [{ status: "CONFIRMED_WITHIN_SCOPE" }],
  } as never;
}

describe("minimum source types per check", () => {
  it("one self-labelled 'unverified' source cannot verify anything (the gap found in v0.3.0)", () => {
    const c = caseWith([ev("e1", "UNVERIFIED", { validUntil: "2028-12-31", recheckOn: null })], () => ["e1"]);
    const blockers = caseReadinessBlockers(c, TODAY);
    expect(blockers.filter((b) => /no current source that can support it/.test(b))).toHaveLength(7);
    expect(caseSuggestion(c, TODAY).outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("an official register alone cannot confirm authority or bank details", () => {
    const c = caseWith([ev("reg", "AUTHORITATIVE")], () => ["reg"]);
    const blockers = caseReadinessBlockers(c, TODAY).join("\n");
    expect(blockers).toMatch(/Representative and authority: a positive finding here needs an independent confirmation/);
    expect(blockers).toMatch(/Transaction and beneficiary: a positive finding here needs an independent confirmation/);
    expect(blockers).toMatch(/Document consistency: a positive finding here needs the client-supplied documents/);
    expect(blockers).not.toMatch(/Legal identity:/);
  });

  it("the right mix of sources passes", () => {
    const sources = [ev("reg", "AUTHORITATIVE"), ev("call", "INDEPENDENT_CONFIRMATION"), ev("inv", "CLIENT_SUPPLIED")];
    const cite: Record<string, string[]> = {
      LEGAL_IDENTITY: ["reg"], TAX_COMPLIANCE: ["reg"], DIGITAL_IDENTITY: ["reg"], OPERATIONAL_EXISTENCE: ["reg"],
      REPRESENTATIVE_AUTHORITY: ["call"], TRANSACTION_BENEFICIARY: ["call"], DOCUMENT_CONSISTENCY: ["inv", "reg"],
    };
    expect(caseReadinessBlockers(caseWith(sources, (l) => cite[l]), TODAY)).toEqual([]);
  });

  it("the supplier's own website cannot establish its digital identity", () => {
    expect(supportGaps("DIGITAL_IDENTITY", ["FIRST_PARTY"])).toHaveLength(1);
    expect(supportGaps("DIGITAL_IDENTITY", ["THIRD_PARTY"])).toHaveLength(0);
  });
});

describe("standard validity catalogue", () => {
  it("fills the standard recheck date for known sources", () => {
    expect(standardValidity("BRS official company search (CR12)", "2026-10-01")).toEqual({
      recheckOn: "2026-10-31",
      validityNote: expect.stringMatching(/30 days/),
    });
    expect(standardValidity("Some website", "2026-10-01")).toBeNull();
  });

  it("flags departures from the standard for the reviewer", () => {
    const base = { sourceName: "BRS official company search (CR12)", category: "AUTHORITATIVE", accessResult: "EXAMINED", checkedDate: "2026-10-01" };
    expect(validityExceptions({ ...base, recheckOn: "2026-10-31" })).toEqual([]);
    expect(validityExceptions({ ...base, recheckOn: "2027-06-01" }).join()).toMatch(/later than the standard 30 days/);
    expect(validityExceptions({ ...base, category: "THIRD_PARTY", recheckOn: "2026-10-31" }).join()).toMatch(/standard is authoritative/);
    expect(validityExceptions({ ...base, sourceName: "Random blog", recheckOn: "2026-10-31" }).join()).toMatch(/Not a standard source/);
    expect(validityExceptions({ ...base, sourceName: "KRA iTax TCC checker", recheckOn: "2026-10-31" }).join()).toMatch(/own expiry date is not recorded/);
  });

  it("treats a validity years past the check as a mistake", () => {
    expect(evidenceState(ev("x", "AUTHORITATIVE", { validUntil: "2099-12-31" }), TODAY)).toBe("INVALID");
    expect(evidenceState(ev("x", "AUTHORITATIVE", { recheckOn: "2030-01-01" }), TODAY)).toBe("INVALID");
    expect(evidenceState(ev("x", "AUTHORITATIVE"), TODAY)).toBe("CURRENT");
  });
});
