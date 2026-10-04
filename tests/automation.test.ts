import { describe, expect, it } from "vitest";
import { evidenceState, evidenceDecisionFindings } from "@/lib/evidence-policy";
import { supplierMatches, type SupplierIdentity } from "@/lib/supplier-matching";
import { attentionQueue } from "@/lib/attention";
import { analyseCase, handoverDraft, type AssistedCase } from "@/lib/case-assistant";
import { suggestOutcome, type FindingStatus } from "@/lib/outcome";

const today = "2026-10-04";
const source = { id: "e1", accessResult: "EXAMINED", checkedDate: today, validUntil: today, recheckOn: null, validityNote: "Expires at the end of the date printed on the source." } as const;
const identity: SupplierIdentity = { id: "s1", legalName: "Mfano Limited", country: "KE", registrationNumber: "PVT-001", kraPin: "P123456789X", domain: "https://www.mfano.example" };

function fixture(): AssistedCase {
  return {
    id: "c1", reference: "KC-2026-0001", version: 1, status: "IN_PROGRESS", decisionPurpose: "Review this supplier before an order", expectedPaymentDate: today,
    counterparty: { ...identity, entityType: null, registrationAuthority: null, tradingNames: null, registeredAddress: null, operatingAddress: null, sector: null, notes: null, createdAt: new Date(today), updatedAt: new Date(today) },
    client: { id: "client", name: "Test client", contactName: null, contactEmail: null, notes: null, createdAt: new Date(today) },
    analystId: "analyst", commissioningAuthorityConfirmed: true, outcome: "VERIFIED_WITHIN_SCOPE", outcomeSummary: "Recorded test conclusion", payments: [], discrepancies: [], reviews: [],
    findings: [{ id: "f1", caseId: "c1", layer: "LEGAL_IDENTITY", status: "VERIFIED", critical: true, finding: "Name and registration match the examined source", confidence: "HIGH", evidenceIds: [source.id], scopeChangeNote: null, updatedById: "analyst", updatedAt: new Date(today) }],
    evidence: [{ ...source, caseId: "c1", code: "E01", sourceName: "Test official source", authority: null, category: "AUTHORITATIVE", url: null, locator: null, summary: "Recorded entity details", confidence: "HIGH", rightsNote: null, documentId: null, createdById: "analyst", createdAt: new Date(today) }],
  };
}

describe("source validity and decision support", () => {
  it("honours inclusive expiry and recheck-day boundaries", () => {
    expect(evidenceState(source, today)).toBe("CURRENT");
    expect(evidenceState(source, "2026-10-05")).toBe("EXPIRED");
    expect(evidenceState({ ...source, validUntil: null, recheckOn: today }, today)).toBe("RECHECK_DUE");
    expect(evidenceState({ ...source, validUntil: null, recheckOn: "2026-10-05" }, today)).toBe("CURRENT");
  });
  it("refuses unknown policies, invalid dates, future checks and unexamined sources", () => {
    expect(evidenceState({ ...source, validUntil: null }, today)).toBe("NOT_SET");
    expect(evidenceState({ ...source, validityNote: "" }, today)).toBe("NOT_SET");
    expect(evidenceState({ ...source, validUntil: "2026-02-30" }, today)).toBe("INVALID");
    expect(evidenceState({ ...source, checkedDate: "2026-10-05" }, today)).toBe("INVALID");
    expect(evidenceState({ ...source, accessResult: "RETRIEVAL_FAILED" }, today)).toBe("UNAVAILABLE");
  });
  it("reduces a positive suggestion when its only source expires without rewriting the finding", () => {
    const c = fixture();
    const initial = evidenceDecisionFindings(c.findings, c.evidence, today);
    expect(suggestOutcome(initial.map(f => ({ ...f, status: f.status as FindingStatus })), []).outcome).toBe("VERIFIED_WITHIN_SCOPE");
    const expired = evidenceDecisionFindings(c.findings, c.evidence, "2026-10-05");
    expect(suggestOutcome(expired.map(f => ({ ...f, status: f.status as FindingStatus })), []).outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(c.findings[0].status).toBe("VERIFIED");
  });
  it("keeps usable independent support when another cited source lapses", () => {
    const c = fixture();
    c.findings[0].evidenceIds.push("e2");
    expect(evidenceDecisionFindings(c.findings, [...c.evidence, { ...source, id: "e2", validUntil: "2026-10-08" }], "2026-10-05")[0].status).toBe("VERIFIED");
  });
});

describe("supplier matching", () => {
  it("finds formatted identifiers and distinguishes weaker name/domain matches", () => {
    const candidates = supplierMatches(identity, [{ ...identity, id: "s2", kraPin: "p 123456789 x", registrationNumber: "pvt001" }, { ...identity, id: "s3", kraPin: "", registrationNumber: "" }]);
    expect(candidates[0].strong).toBe(true);
    expect(candidates[0].reasons).toContain("Same KRA PIN");
    expect(candidates[1].strong).toBe(false);
    expect(candidates[1].reasons).toEqual(["Same recorded name", "Shared website domain"]);
  });
  it("does not equate blank IDs or registration numbers from different countries/authorities", () => {
    expect(supplierMatches({ ...identity, kraPin: "", domain: null }, [{ ...identity, id: "s2", country: "UG", domain: null }])).toEqual([]);
    expect(supplierMatches({ ...identity, registrationAuthority: "Registry A", kraPin: null, domain: null }, [{ ...identity, id: "s2", legalName: "Other business", registrationAuthority: "Registry B", kraPin: null, domain: null }])).toEqual([]);
    expect(supplierMatches({ ...identity, registrationNumber: null, kraPin: null, domain: null }, [{ ...identity, id: "s2", legalName: "Different name", registrationNumber: null, kraPin: null, domain: null }])).toEqual([]);
  });
});

describe("automatic case assistance", () => {
  it("explains stale positive support and a reached payment date", () => {
    const a = analyseCase(fixture(), "2026-10-05");
    expect(a.tasks.some(t => t.id === "source-e1" && t.priority === "urgent")).toBe(true);
    expect(a.tasks.some(t => t.id === "payment-date")).toBe(true);
    expect(a.blockers.some(b => b.includes("no current source"))).toBe(true);
    expect(a.suggestion.outcome).toBe("INSUFFICIENT_EVIDENCE");
  });
  it("leaves historical cases frozen and without active tasks", () => {
    const c = fixture(); c.status = "RELEASED";
    const before = JSON.stringify(c);
    expect(analyseCase(c, "2026-10-05").tasks).toEqual([]);
    expect(JSON.stringify(c)).toBe(before);
    expect(handoverDraft(c, "2026-10-05")).toContain("historical case");
  });
  it("drafts only recorded facts with evidence codes and without raw bank account data", () => {
    const c = fixture();
    const draft = handoverDraft(c, today);
    expect(draft).toContain("[E01]");
    expect(draft).toContain(c.evidence[0].summary);
    expect(draft).toContain("does not verify an entity, approve payment");
    expect(draft).not.toContain("accountEnc");
  });
  it("removes historical cases from the active queue and prioritises expired sources", () => {
    const c = fixture();
    const tasks = attentionQueue([c, { ...c, id: "old", status: "RELEASED" }], c.evidence, c.findings, "2026-10-05");
    expect(tasks.find(t => t.id === "source-e1")?.priority).toBe("urgent");
    expect(tasks.some(t => t.id.startsWith("old"))).toBe(false);
    expect(tasks[0].priority).toBe("urgent");
  });
});
