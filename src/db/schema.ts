import {
  pgTable,
  pgEnum,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------- Enums (mirror the operating manual's controlled vocabularies) ----------

export const roleEnum = pgEnum("role", ["ADMIN", "ANALYST", "REVIEWER"]);

export const depthEnum = pgEnum("service_depth", ["DIGITAL", "ENHANCED", "EXTENDED"]);

export const caseStatusEnum = pgEnum("case_status", [
  "DRAFT",
  "INTAKE_COMPLETE",
  "IN_PROGRESS",
  "AWAITING_CLIENT",
  "AWAITING_ACCESS",
  "AWAITING_HUMAN_QC",
  "READY_TO_RELEASE",
  "RELEASED",
  "CLOSED",
  "CANCELLED",
]);

export const outcomeEnum = pgEnum("verification_outcome", [
  "VERIFIED_WITHIN_SCOPE",
  "VERIFIED_WITH_ISSUES",
  "INSUFFICIENT_EVIDENCE",
  "MATERIAL_RED_FLAGS",
]);

export const layerEnum = pgEnum("layer", [
  "LEGAL_IDENTITY",
  "TAX_COMPLIANCE",
  "DIGITAL_IDENTITY",
  "REPRESENTATIVE_AUTHORITY",
  "OPERATIONAL_EXISTENCE",
  "DOCUMENT_CONSISTENCY",
  "TRANSACTION_BENEFICIARY",
]);

export const findingStatusEnum = pgEnum("finding_status", [
  "NOT_STARTED",
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNRESOLVED",
  "CONFLICTING",
  "NOT_AVAILABLE",
]);

export const confidenceEnum = pgEnum("confidence", ["HIGH", "MEDIUM", "LOW", "NOT_ASSESSED"]);

export const sourceCategoryEnum = pgEnum("source_category", [
  "AUTHORITATIVE",
  "FIRST_PARTY",
  "CLIENT_SUPPLIED",
  "INDEPENDENT_CONFIRMATION",
  "THIRD_PARTY",
  "UNVERIFIED",
]);

export const accessResultEnum = pgEnum("access_result", [
  "EXAMINED",
  "ACCESS_REQUIRED",
  "RETRIEVAL_FAILED",
  "NOT_SUPPLIED",
]);

export const severityEnum = pgEnum("severity", ["CONTEXTUAL", "MINOR", "MATERIAL", "CRITICAL"]);

export const discrepancyStateEnum = pgEnum("discrepancy_state", [
  "OPEN",
  "AWAITING_EVIDENCE",
  "EXPLAINED",
  "RESOLVED",
  "ACCEPTED_WITH_LIMITATION",
  "ESCALATED",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "PROPOSED_UNVERIFIED",
  "FROZEN_PENDING_CONFIRMATION",
  "CONFIRMED_WITHIN_SCOPE",
  "REJECTED",
  "SUPERSEDED",
  "REVOKED",
]);

export const reviewResultEnum = pgEnum("review_result", ["PASS", "FAIL"]);

export const timeActivityEnum = pgEnum("time_activity", [
  "INTAKE",
  "SOURCE_CHECKS",
  "ANALYSIS",
  "CLIENT_COMMS",
  "REPORT",
  "QC",
  "OTHER",
]);

// ---------- Tables ----------

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 254 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("ANALYST"),
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    active: boolean("active").notNull().default(true),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    sessionVersion: integer("session_version").notNull().default(1),
    createdAt: created(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  contactName: varchar("contact_name", { length: 120 }),
  contactEmail: varchar("contact_email", { length: 254 }),
  notes: text("notes"),
  createdAt: created(),
});

export const counterparties = pgTable(
  "counterparties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    legalName: varchar("legal_name", { length: 300 }).notNull(),
    country: varchar("country", { length: 2 }).notNull().default("KE"),
    entityType: varchar("entity_type", { length: 80 }),
    registrationNumber: varchar("registration_number", { length: 80 }),
    registrationAuthority: varchar("registration_authority", { length: 120 }),
    kraPin: varchar("kra_pin", { length: 20 }),
    tradingNames: text("trading_names"),
    domain: varchar("domain", { length: 253 }),
    registeredAddress: text("registered_address"),
    operatingAddress: text("operating_address"),
    sector: varchar("sector", { length: 120 }),
    notes: text("notes"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("counterparties_name_idx").on(t.legalName), index("counterparties_pin_idx").on(t.kraPin)],
);

export const cases = pgTable(
  "cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reference: varchar("reference", { length: 20 }).notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => counterparties.id),
    depth: depthEnum("depth").notNull().default("DIGITAL"),
    status: caseStatusEnum("status").notNull().default("DRAFT"),
    // Intake: the decision
    decisionPurpose: text("decision_purpose").notNull(),
    decisionOwner: varchar("decision_owner", { length: 160 }),
    requesterName: varchar("requester_name", { length: 160 }),
    requesterEmail: varchar("requester_email", { length: 254 }),
    goodsServices: text("goods_services"),
    amount: numeric("amount", { precision: 16, scale: 2 }),
    currency: varchar("currency", { length: 3 }).notNull().default("KES"),
    expectedPaymentDate: date("expected_payment_date"),
    isNewSupplier: boolean("is_new_supplier").notNull().default(true),
    permittedContacts: text("permitted_contacts"),
    commissioningAuthorityConfirmed: boolean("commissioning_authority_confirmed").notNull().default(false),
    lawfulBasisNote: text("lawful_basis_note"),
    exclusions: text("exclusions"),
    // Commercials (for pilot economics)
    feeKes: integer("fee_kes"),
    directCostsKes: integer("direct_costs_kes").notNull().default(0),
    // People
    analystId: uuid("analyst_id").references(() => users.id),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    // Conclusion
    outcome: outcomeEnum("outcome"),
    outcomeSummary: text("outcome_summary"),
    nextSteps: text("next_steps"),
    // Version: bumped on every content change; a review is only valid for the version it saw.
    version: integer("version").notNull().default(1),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("cases_reference_idx").on(t.reference), index("cases_status_idx").on(t.status)],
);

export const representatives = pgTable("representatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  claimedRole: varchar("claimed_role", { length: 160 }),
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 40 }),
  howIntroduced: text("how_introduced"),
  mandateEvidence: text("mandate_evidence"),
  createdAt: created(),
});

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    layer: layerEnum("layer").notNull(),
    status: findingStatusEnum("status").notNull().default("NOT_STARTED"),
    critical: boolean("critical").notNull().default(true),
    scopeChangeNote: text("scope_change_note"),
    finding: text("finding"),
    confidence: confidenceEnum("confidence").notNull().default("NOT_ASSESSED"),
    updatedById: uuid("updated_by_id").references(() => users.id),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("findings_case_layer_idx").on(t.caseId, t.layer)],
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  storedName: varchar("stored_name", { length: 120 }).notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  docType: varchar("doc_type", { length: 60 }).notNull(),
  source: text("source"),
  receivedDate: date("received_date"),
  uploadedById: uuid("uploaded_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: created(),
});

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 12 }).notNull(),
    sourceName: varchar("source_name", { length: 200 }).notNull(),
    authority: varchar("authority", { length: 200 }),
    category: sourceCategoryEnum("category").notNull(),
    accessResult: accessResultEnum("access_result").notNull(),
    url: text("url"),
    locator: varchar("locator", { length: 300 }),
    checkedDate: date("checked_date").notNull(),
    summary: text("summary").notNull(),
    confidence: confidenceEnum("confidence").notNull().default("NOT_ASSESSED"),
    rightsNote: text("rights_note"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id),
    createdAt: created(),
  },
  (t) => [uniqueIndex("evidence_case_code_idx").on(t.caseId, t.code)],
);

export const findingEvidence = pgTable(
  "finding_evidence",
  {
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id, { onDelete: "cascade" }),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => evidence.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("finding_evidence_pk").on(t.findingId, t.evidenceId)],
);

export const discrepancies = pgTable("discrepancies", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 8 }).notNull(),
  severity: severityEnum("severity").notNull(),
  state: discrepancyStateEnum("state").notNull().default("OPEN"),
  // true = the contradiction is established by reviewed evidence; false = a candidate still being checked
  established: boolean("established").notNull().default(false),
  description: text("description").notNull(),
  explanation: text("explanation"),
  effect: text("effect"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  caseVersion: integer("case_version").notNull(),
  result: reviewResultEnum("result").notNull(),
  checklist: jsonb("checklist").$type<Record<string, boolean>>().notNull(),
  defects: text("defects"),
  createdAt: created(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  caseVersion: integer("case_version").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  releasedById: uuid("released_by_id")
    .notNull()
    .references(() => users.id),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id),
  createdAt: created(),
});

export const paymentInstructions = pgTable("payment_instructions", {
  id: uuid("id").primaryKey().defaultRandom(),
  counterpartyId: uuid("counterparty_id")
    .notNull()
    .references(() => counterparties.id),
  caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
  status: paymentStatusEnum("status").notNull().default("PROPOSED_UNVERIFIED"),
  isChange: boolean("is_change").notNull().default(false),
  previousInstructionId: uuid("previous_instruction_id"),
  beneficiaryName: varchar("beneficiary_name", { length: 300 }).notNull(),
  bankName: varchar("bank_name", { length: 160 }).notNull(),
  branch: varchar("branch", { length: 160 }),
  accountEnc: text("account_enc").notNull(),
  accountLast4: varchar("account_last4", { length: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("KES"),
  sourceDescription: text("source_description").notNull(),
  requestedEffectiveDate: date("requested_effective_date"),
  // Independent confirmation
  confirmationChannel: text("confirmation_channel"),
  channelEstablishedHow: text("channel_established_how"),
  channelIndependent: boolean("channel_independent"),
  confirmedWithName: varchar("confirmed_with_name", { length: 160 }),
  confirmedWithRole: varchar("confirmed_with_role", { length: 160 }),
  confirmationNotes: text("confirmation_notes"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  confirmationRecordedById: uuid("confirmation_recorded_by_id").references(() => users.id),
  decisionNote: text("decision_note"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
});

export const paymentApprovals = pgTable(
  "payment_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instructionId: uuid("instruction_id")
      .notNull()
      .references(() => paymentInstructions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    note: text("note"),
    createdAt: created(),
  },
  (t) => [uniqueIndex("payment_approvals_unique").on(t.instructionId, t.userId)],
);

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: uuid("case_id")
    .notNull()
    .references(() => cases.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  minutes: integer("minutes").notNull(),
  activity: timeActivityEnum("activity").notNull(),
  workDate: date("work_date").notNull(),
  note: text("note"),
  createdAt: created(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    caseId: uuid("case_id").references(() => cases.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("audit_case_idx").on(t.caseId), index("audit_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Evidence = typeof evidence.$inferSelect;
export type Discrepancy = typeof discrepancies.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type PaymentInstruction = typeof paymentInstructions.$inferSelect;
export type PaymentApproval = typeof paymentApprovals.$inferSelect;
