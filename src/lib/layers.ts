// The seven verification layers, with the checks an analyst should run for each.
// Guidance is drawn from the Kenya source map (Trust Pack v1) plus KRA / eTIMS checks.

export const LAYERS = [
  "LEGAL_IDENTITY",
  "TAX_COMPLIANCE",
  "DIGITAL_IDENTITY",
  "REPRESENTATIVE_AUTHORITY",
  "OPERATIONAL_EXISTENCE",
  "DOCUMENT_CONSISTENCY",
  "TRANSACTION_BENEFICIARY",
] as const;

export type Layer = (typeof LAYERS)[number];

export interface LayerDefinition {
  layer: Layer;
  title: string;
  question: string;
  criticalByDefault: boolean;
  checks: string[];
  cautions: string[];
}

export const LAYER_DEFINITIONS: Record<Layer, LayerDefinition> = {
  LEGAL_IDENTITY: {
    layer: "LEGAL_IDENTITY",
    title: "Legal identity",
    question: "Is the business we are paying the exact legal entity named on the documents?",
    criticalByDefault: true,
    checks: [
      "Run a fresh BRS official search on eCitizen: CR12 for companies (KES 650) or CR13 for business names (KES 250).",
      "Match exact name, registration number, entity type and registry status to the quote / invoice / contract.",
      "Record the search date, receipt reference and returned record; keep it in Documents.",
      "Note trading names and historical names separately; never merge two different registration numbers.",
    ],
    cautions: [
      "Registration does not prove the sales rep's authority, product quality or the bank account.",
      "A business name (sole proprietor) is not a separate legal person: identify the proprietor who contracts.",
    ],
  },
  TAX_COMPLIANCE: {
    layer: "TAX_COMPLIANCE",
    title: "Tax compliance (KRA / eTIMS)",
    question: "Can the buyer safely claim VAT and expense deductions on this supplier's invoices?",
    criticalByDefault: true,
    checks: [
      "Check the supplier's KRA PIN on the iTax PIN checker and confirm it belongs to the resolved legal entity.",
      "Check the Tax Compliance Certificate on the iTax TCC checker: validity and expiry date.",
      "Confirm the invoice is a valid electronic tax invoice (eTIMS) using KRA's invoice checker; the PIN and amounts must match.",
      "For goods, ask for delivery notes, purchase orders or transport records: courts expect a trail beyond the invoice.",
    ],
    cautions: [
      "A valid PIN or TCC is not proof of solvency or of all tax liabilities.",
      "Never ask for or use the supplier's iTax login.",
    ],
  },
  DIGITAL_IDENTITY: {
    layer: "DIGITAL_IDENTITY",
    title: "Digital identity",
    question: "Do the website, email and phone numbers really belong to this entity?",
    criticalByDefault: false,
    checks: [
      "Compare the sender email domain with the official website and registry details; look for lookalike domains.",
      "Check domain registration (KENIC for .ke, WHOIS for others): age and registrant where visible.",
      "Find the phone number and address on independent sources (regulator lists, official filings), not only the supplier's own pages.",
    ],
    cautions: [
      "A free email address or a new domain is a lead to check, not proof of fraud.",
      "Web designers' and hosting providers' addresses on a site are not the supplier's address.",
    ],
  },
  REPRESENTATIVE_AUTHORITY: {
    layer: "REPRESENTATIVE_AUTHORITY",
    title: "Representative and authority",
    question: "Is the person we are dealing with authorised to make this deal and give these instructions?",
    criticalByDefault: true,
    checks: [
      "Contact the company through a channel found independently (registry, regulator list, prior verified contact), never only the one in the email.",
      "Confirm the person, their role and their mandate for this specific transaction.",
      "Review any authority letter or board resolution against the registry's officer list.",
    ],
    cautions: [
      "A job title or company-domain email is not proof of authority.",
      "Do not collect national ID numbers or home addresses by default.",
    ],
  },
  OPERATIONAL_EXISTENCE: {
    layer: "OPERATIONAL_EXISTENCE",
    title: "Operational existence",
    question: "Does the business actually operate in a way that fits this order?",
    criticalByDefault: false,
    checks: [
      "Check sector licences where the goods or service require them (e.g. EPRA, CA, NCA, KEBS marks, professional bodies).",
      "Check the county business permit where available.",
      "Look for public procurement history (PPIP awards) and other independent trading evidence.",
      "Site visit only if in scope, lawful and done by an authorised provider.",
    ],
    cautions: [
      "No public evidence is not proof the business does not operate.",
      "Public activity does not prove capacity to deliver this order.",
    ],
  },
  DOCUMENT_CONSISTENCY: {
    layer: "DOCUMENT_CONSISTENCY",
    title: "Document consistency",
    question: "Do the quote, invoice, contract and certificates agree with each other and with official records?",
    criticalByDefault: true,
    checks: [
      "Compare name, registration number, PIN, address, bank details, amounts and dates across every document.",
      "Check certificates and licences against the issuer's register (number, holder, activity, expiry).",
      "Keep the original files; note who sent each one and when.",
    ],
    cautions: [
      "A formatting difference is not forgery. Record exactly which field differs and why it matters.",
      "Confirm any text pulled out automatically (OCR) against the original by eye.",
    ],
  },
  TRANSACTION_BENEFICIARY: {
    layer: "TRANSACTION_BENEFICIARY",
    title: "Transaction and beneficiary",
    question: "Is the bank account in the payment instruction really the supplier's, for this deal?",
    criticalByDefault: true,
    checks: [
      "Beneficiary name must match the contracting entity. Any third-party or group account needs a documented reason.",
      "Confirm the account through an independently established channel; record who confirmed it and how.",
      "Log the instruction under Bank details. Changed details stay frozen until confirmed and approved by two people.",
    ],
    cautions: [
      "A bank letter image or a 'our bankers' line on an invoice is not proof of account ownership.",
      "This system records verification; it never sends money.",
    ],
  },
};

export const FINDING_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: "Not started",
  VERIFIED: "Verified",
  PARTIALLY_VERIFIED: "Partially verified",
  UNRESOLVED: "Unresolved",
  CONFLICTING: "Conflicting",
  NOT_AVAILABLE: "Not available",
};

export const OUTCOME_LABELS: Record<string, string> = {
  VERIFIED_WITHIN_SCOPE: "Verified within scope",
  VERIFIED_WITH_ISSUES: "Verified with issues",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  MATERIAL_RED_FLAGS: "Material red flags",
};

export const DISCREPANCY_CODES: Record<string, string> = {
  "ID-01": "Legal-entity mismatch",
  "ID-02": "Name / entity history",
  "AD-01": "Address attribution / freshness",
  "DI-01": "Digital-channel mismatch",
  "RP-01": "Representative / authority gap",
  "OP-01": "Operating / capacity uncertainty",
  "LC-01": "Permission / licence mismatch",
  "TX-02": "Tax / eTIMS invoice issue",
  "DC-01": "Document field contradiction",
  "TX-01": "Transaction party mismatch",
  "PY-01": "Changed payment instruction",
  "OW-01": "Ownership / group attribution",
  "SN-01": "Sanctions / debarment candidate",
  "AI-01": "Adverse information",
  "EV-01": "Evidence quality / access gap",
};

/** Replace layer codes with their titles, for showing outcome reasons to people. */
export function titled<T extends { layer: string }>(rows: T[]): T[] {
  return rows.map((r) => ({ ...r, layer: LAYER_DEFINITIONS[r.layer as Layer]?.title ?? r.layer }));
}
