import { describe, expect, it, beforeAll } from "vitest";
import { suggestOutcome, isOutcomeAllowed, type FindingInput } from "@/lib/outcome";
import { canTransition, submitBlockers, releaseBlockers, reviewBlockers, editInvalidatesReview } from "@/lib/workflow";
import { approvalBlockers, confirmationBlockers, initialStatus, statusAfterApproval } from "@/lib/payments";
import { checkUpload } from "@/lib/files";
import { canonicalJson, decrypt, encrypt } from "@/lib/crypto";

const all = (status: FindingInput["status"]): FindingInput[] =>
  ["LEGAL_IDENTITY", "TAX_COMPLIANCE", "DIGITAL_IDENTITY", "REPRESENTATIVE_AUTHORITY", "OPERATIONAL_EXISTENCE", "DOCUMENT_CONSISTENCY", "TRANSACTION_BENEFICIARY"].map(
    (layer) => ({ layer, status, critical: !["DIGITAL_IDENTITY", "OPERATIONAL_EXISTENCE"].includes(layer) }),
  );

describe("outcome engine", () => {
  it("returns no outcome until every layer is assessed", () => {
    const f = all("VERIFIED");
    f[0].status = "NOT_STARTED";
    expect(suggestOutcome(f, []).outcome).toBeNull();
  });

  it("verifies within scope when everything is verified and no issues are open", () => {
    expect(suggestOutcome(all("VERIFIED"), []).outcome).toBe("VERIFIED_WITHIN_SCOPE");
  });

  it("a critical gap gives insufficient evidence, never a positive result", () => {
    const f = all("VERIFIED");
    f.find((x) => x.layer === "TRANSACTION_BENEFICIARY")!.status = "NOT_AVAILABLE";
    expect(suggestOutcome(f, []).outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("a non-critical gap gives verified with issues", () => {
    const f = all("VERIFIED");
    f.find((x) => x.layer === "DIGITAL_IDENTITY")!.status = "PARTIALLY_VERIFIED";
    expect(suggestOutcome(f, []).outcome).toBe("VERIFIED_WITH_ISSUES");
  });

  it("an established material discrepancy takes precedence over a missing check", () => {
    const f = all("VERIFIED");
    f[0].status = "UNRESOLVED";
    const r = suggestOutcome(f, [{ code: "TX-01", severity: "MATERIAL", state: "OPEN", established: true }]);
    expect(r.outcome).toBe("MATERIAL_RED_FLAGS");
  });

  it("a merely possible conflict stays insufficient evidence, not red flags", () => {
    const r = suggestOutcome(all("VERIFIED"), [{ code: "SN-01", severity: "CRITICAL", state: "OPEN", established: false }]);
    expect(r.outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("'accepted with limitation' cannot override a critical issue", () => {
    const r = suggestOutcome(all("VERIFIED"), [{ code: "RP-01", severity: "CRITICAL", state: "ACCEPTED_WITH_LIMITATION", established: true }]);
    expect(r.outcome).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("explained history does not count against the supplier", () => {
    const r = suggestOutcome(all("VERIFIED"), [{ code: "ID-02", severity: "MINOR", state: "EXPLAINED", established: true }]);
    expect(r.outcome).toBe("VERIFIED_WITHIN_SCOPE");
  });

  it("a conflicting critical finding is a red flag", () => {
    const f = all("VERIFIED");
    f.find((x) => x.layer === "DOCUMENT_CONSISTENCY")!.status = "CONFLICTING";
    expect(suggestOutcome(f, []).outcome).toBe("MATERIAL_RED_FLAGS");
  });

  it("analyst cannot pick a more favourable outcome than the evidence allows", () => {
    expect(isOutcomeAllowed("VERIFIED_WITHIN_SCOPE", "INSUFFICIENT_EVIDENCE")).toBe(false);
    expect(isOutcomeAllowed("MATERIAL_RED_FLAGS", "INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(isOutcomeAllowed("INSUFFICIENT_EVIDENCE", "INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(isOutcomeAllowed("INSUFFICIENT_EVIDENCE", "MATERIAL_RED_FLAGS")).toBe(false);
    expect(isOutcomeAllowed("INSUFFICIENT_EVIDENCE", null)).toBe(false);
  });
});

describe("workflow gates", () => {
  const base = {
    findings: all("VERIFIED").map((f) => ({ ...f, finding: "ok", evidenceCount: 1 })),
    discrepancies: [],
    outcome: "VERIFIED_WITHIN_SCOPE" as const,
    outcomeSummary: "Verified.",
    commissioningAuthorityConfirmed: true,
    analystId: "a1",
  };

  it("allows submission when complete", () => {
    expect(submitBlockers(base)).toEqual([]);
  });

  it("blocks uncited findings", () => {
    const f = base.findings.map((x, i) => (i === 0 ? { ...x, evidenceCount: 0 } : x));
    expect(submitBlockers({ ...base, findings: f }).join()).toMatch(/no evidence cited/);
  });

  it("blocks an outcome better than the evidence", () => {
    const f = base.findings.map((x) => (x.layer === "TAX_COMPLIANCE" ? { ...x, status: "UNRESOLVED" as const } : x));
    expect(submitBlockers({ ...base, findings: f }).join()).toMatch(/more favourable/);
  });

  it("analyst cannot review or release their own case", () => {
    expect(reviewBlockers({ reviewerId: "a1", analystId: "a1", reviewerRole: "REVIEWER" })).not.toEqual([]);
    expect(reviewBlockers({ reviewerId: "r1", analystId: "a1", reviewerRole: "ANALYST" })).not.toEqual([]);
    expect(reviewBlockers({ reviewerId: "r1", analystId: "a1", reviewerRole: "REVIEWER" })).toEqual([]);
  });

  it("a change after review blocks release", () => {
    const r = releaseBlockers({
      status: "READY_TO_RELEASE",
      caseVersion: 5,
      analystId: "a1",
      releaserId: "r1",
      releaserRole: "REVIEWER",
      latestReview: { result: "PASS", caseVersion: 4, reviewerId: "r1" },
    });
    expect(r.join()).toMatch(/changed after review/);
  });

  it("release passes with an independent, current, passing review", () => {
    expect(
      releaseBlockers({
        status: "READY_TO_RELEASE",
        caseVersion: 5,
        analystId: "a1",
        releaserId: "r1",
        releaserRole: "REVIEWER",
        latestReview: { result: "PASS", caseVersion: 5, reviewerId: "r1" },
      }),
    ).toEqual([]);
  });

  it("transitions follow the workflow", () => {
    expect(canTransition("DRAFT", "RELEASED")).toBe(false);
    expect(canTransition("IN_PROGRESS", "AWAITING_HUMAN_QC")).toBe(true);
    expect(canTransition("AWAITING_HUMAN_QC", "RELEASED")).toBe(false);
    expect(canTransition("CLOSED", "IN_PROGRESS")).toBe(false);
    expect(editInvalidatesReview("READY_TO_RELEASE")).toBe(true);
  });
});

describe("bank-detail changes", () => {
  it("a change starts frozen", () => {
    expect(initialStatus(true)).toBe("FROZEN_PENDING_CONFIRMATION");
    expect(initialStatus(false)).toBe("PROPOSED_UNVERIFIED");
  });

  it("confirmation via the requester's own contact details is refused", () => {
    const b = confirmationBlockers("FROZEN_PENDING_CONFIRMATION", {
      confirmationChannel: "Phone",
      channelEstablishedHow: "Number in the change email",
      channelIndependent: false,
      confirmedWithName: "Jane",
    });
    expect(b.join()).toMatch(/independent/);
  });

  it("the requester cannot approve, nobody approves twice, and confirmation comes first", () => {
    const base = { status: "FROZEN_PENDING_CONFIRMATION" as const, createdById: "u1", confirmationRecordedById: "u2", hasConfirmation: true, existingApproverIds: ["u2"] };
    expect(approvalBlockers({ ...base, approverId: "u1" }).join()).toMatch(/logged the instruction/);
    expect(approvalBlockers({ ...base, approverId: "u2" }).join()).toMatch(/already approved/);
    expect(approvalBlockers({ ...base, approverId: "u3", hasConfirmation: false }).join()).toMatch(/confirmation/);
    expect(approvalBlockers({ ...base, approverId: "u3" })).toEqual([]);
  });

  it("needs the required number of distinct approvals", () => {
    expect(statusAfterApproval("FROZEN_PENDING_CONFIRMATION", 1, 2)).toBe("FROZEN_PENDING_CONFIRMATION");
    expect(statusAfterApproval("FROZEN_PENDING_CONFIRMATION", 2, 2)).toBe("CONFIRMED_WITHIN_SCOPE");
    expect(statusAfterApproval("REJECTED", 5, 2)).toBe("REJECTED");
  });
});

describe("uploads and crypto", () => {
  beforeAll(() => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("accepts a real PDF and rejects a renamed executable", () => {
    expect(checkUpload("invoice.pdf", Buffer.from("%PDF-1.7 ...")).ok).toBe(true);
    expect(checkUpload("invoice.pdf", Buffer.from([0x4d, 0x5a, 0x90, 0x00])).ok).toBe(false);
    expect(checkUpload("tool.exe", Buffer.from("MZ")).ok).toBe(false);
  });

  it("encrypts and decrypts, with a fresh IV each time", () => {
    const a = encrypt("0123456789");
    const b = encrypt("0123456789");
    expect(a).not.toEqual(b);
    expect(decrypt(a)).toBe("0123456789");
  });

  it("tampered ciphertext fails", () => {
    const parts = encrypt("secret").split(":");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("canonical JSON is key-order independent", () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
  });
});

describe("beneficiary guard", () => {
  it("cannot send a case for review with an unconfirmed beneficiary marked verified", () => {
    const findings = all("VERIFIED").map((f) => ({ ...f, finding: "ok", evidenceCount: 1 }));
    const r = submitBlockers({
      findings,
      discrepancies: [],
      outcome: "VERIFIED_WITHIN_SCOPE",
      outcomeSummary: "x",
      commissioningAuthorityConfirmed: true,
      analystId: "a1",
      beneficiaryVerifiedWithoutConfirmation: true,
    });
    expect(r.join()).toMatch(/no bank details on this case are confirmed/);
  });
});
