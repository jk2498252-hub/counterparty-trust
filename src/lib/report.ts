// Builds the client report as plain data. The same data is rendered for previews
// and frozen (with a SHA-256 hash) when a report is released.

import { LAYER_DEFINITIONS, type Layer } from "./layers";
import { suggestOutcome, type Outcome } from "./outcome";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "./payments";

export interface ReportData {
  reference: string;
  version: number;
  asOf: string;
  client: string;
  supplier: {
    legalName: string;
    registrationNumber: string | null;
    kraPin: string | null;
    country: string;
    domain: string | null;
  };
  depth: string;
  decisionPurpose: string;
  amount: string | null;
  currency: string;
  outcome: Outcome | null;
  outcomeSummary: string | null;
  nextSteps: string | null;
  exclusions: string | null;
  layers: {
    layer: Layer;
    title: string;
    critical: boolean;
    status: string;
    finding: string | null;
    confidence: string;
    evidenceCodes: string[];
    scopeChangeNote: string | null;
  }[];
  issues: { code: string; severity: string; state: string; established: boolean; description: string; explanation: string | null; effect: string | null }[];
  payments: { beneficiaryName: string; bankName: string; accountMasked: string; status: string; statusLabel: string; isChange: boolean }[];
  evidence: {
    code: string;
    sourceName: string;
    authority: string | null;
    category: string;
    accessResult: string;
    checkedDate: string;
    locator: string | null;
    summary: string;
    confidence: string;
    url: string | null;
    capture?: { documentId: string; name: string; sha256: string } | null;
  }[];
  review: { reviewer: string; date: string; result: string } | null;
  suggestedOutcome: Outcome | null;
}

type CaseLike = {
  reference: string;
  version: number;
  depth: string;
  decisionPurpose: string;
  amount: string | null;
  currency: string;
  outcome: Outcome | null;
  outcomeSummary: string | null;
  nextSteps: string | null;
  exclusions: string | null;
  client: { name: string };
  counterparty: { legalName: string; registrationNumber: string | null; kraPin: string | null; country: string; domain: string | null };
  findings: {
    layer: Layer;
    status: string;
    critical: boolean;
    finding: string | null;
    confidence: string;
    evidenceIds: string[];
    scopeChangeNote: string | null;
  }[];
  evidence: {
    id: string;
    code: string;
    sourceName: string;
    authority: string | null;
    category: string;
    accessResult: string;
    checkedDate: string;
    locator: string | null;
    summary: string;
    confidence: string;
    url: string | null;
    documentId?: string | null;
  }[];
  documents?: { id: string; originalName: string; sha256: string }[];
  discrepancies: { code: string; severity: string; state: string; established: boolean; description: string; explanation: string | null; effect: string | null }[];
  payments: { beneficiaryName: string; bankName: string; accountLast4: string; status: string; isChange: boolean }[];
  reviews: { reviewerId: string; result: string; caseVersion: number; createdAt: Date }[];
  userName: (id: string) => string;
};

export function buildReportData(c: CaseLike, asOf: string): ReportData {
  const codeById = new Map(c.evidence.map((e) => [e.id, e.code]));
  const documentsById = new Map((c.documents ?? []).map((d) => [d.id, d]));
  const latestReview = c.reviews.find((r) => r.caseVersion === c.version && r.result === "PASS") ?? null;
  const suggestion = suggestOutcome(
    c.findings.map((f) => ({ layer: f.layer, status: f.status as never, critical: f.critical })),
    c.discrepancies.map((d) => ({ code: d.code, severity: d.severity as never, state: d.state as never, established: d.established })),
  );
  return {
    reference: c.reference,
    version: c.version,
    asOf,
    client: c.client.name,
    supplier: {
      legalName: c.counterparty.legalName,
      registrationNumber: c.counterparty.registrationNumber,
      kraPin: c.counterparty.kraPin,
      country: c.counterparty.country,
      domain: c.counterparty.domain,
    },
    depth: c.depth,
    decisionPurpose: c.decisionPurpose,
    amount: c.amount,
    currency: c.currency,
    outcome: c.outcome,
    outcomeSummary: c.outcomeSummary,
    nextSteps: c.nextSteps,
    exclusions: c.exclusions,
    layers: c.findings.map((f) => ({
      layer: f.layer,
      title: LAYER_DEFINITIONS[f.layer].title,
      critical: f.critical,
      status: f.status,
      finding: f.finding,
      confidence: f.confidence,
      evidenceCodes: f.evidenceIds.map((id) => codeById.get(id)).filter((x): x is string => !!x).sort(),
      scopeChangeNote: f.scopeChangeNote,
    })),
    issues: c.discrepancies.map((d) => ({
      code: d.code,
      severity: d.severity,
      state: d.state,
      established: d.established,
      description: d.description,
      explanation: d.explanation,
      effect: d.effect,
    })),
    payments: c.payments.map((p) => ({
      beneficiaryName: p.beneficiaryName,
      bankName: p.bankName,
      accountMasked: `•••• ${p.accountLast4}`,
      status: p.status,
      statusLabel: PAYMENT_STATUS_LABELS[p.status as PaymentStatus],
      isChange: p.isChange,
    })),
    evidence: c.evidence.map((e) => ({
      code: e.code,
      sourceName: e.sourceName,
      authority: e.authority,
      category: e.category,
      accessResult: e.accessResult,
      checkedDate: e.checkedDate,
      locator: e.locator,
      summary: e.summary,
      confidence: e.confidence,
      url: e.url,
      capture: e.documentId && documentsById.has(e.documentId)
        ? { documentId: e.documentId, name: documentsById.get(e.documentId)!.originalName, sha256: documentsById.get(e.documentId)!.sha256 }
        : null,
    })),
    review: latestReview
      ? { reviewer: c.userName(latestReview.reviewerId), date: latestReview.createdAt.toISOString().slice(0, 10), result: latestReview.result }
      : null,
    suggestedOutcome: suggestion.outcome,
  };
}
