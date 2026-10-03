CREATE TYPE "public"."access_result" AS ENUM('EXAMINED', 'ACCESS_REQUIRED', 'RETRIEVAL_FAILED', 'NOT_SUPPLIED');--> statement-breakpoint
CREATE TYPE "public"."case_status" AS ENUM('DRAFT', 'INTAKE_COMPLETE', 'IN_PROGRESS', 'AWAITING_CLIENT', 'AWAITING_ACCESS', 'AWAITING_HUMAN_QC', 'READY_TO_RELEASE', 'RELEASED', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('HIGH', 'MEDIUM', 'LOW', 'NOT_ASSESSED');--> statement-breakpoint
CREATE TYPE "public"."service_depth" AS ENUM('DIGITAL', 'ENHANCED', 'EXTENDED');--> statement-breakpoint
CREATE TYPE "public"."discrepancy_state" AS ENUM('OPEN', 'AWAITING_EVIDENCE', 'EXPLAINED', 'RESOLVED', 'ACCEPTED_WITH_LIMITATION', 'ESCALATED');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('NOT_STARTED', 'VERIFIED', 'PARTIALLY_VERIFIED', 'UNRESOLVED', 'CONFLICTING', 'NOT_AVAILABLE');--> statement-breakpoint
CREATE TYPE "public"."layer" AS ENUM('LEGAL_IDENTITY', 'TAX_COMPLIANCE', 'DIGITAL_IDENTITY', 'REPRESENTATIVE_AUTHORITY', 'OPERATIONAL_EXISTENCE', 'DOCUMENT_CONSISTENCY', 'TRANSACTION_BENEFICIARY');--> statement-breakpoint
CREATE TYPE "public"."verification_outcome" AS ENUM('VERIFIED_WITHIN_SCOPE', 'VERIFIED_WITH_ISSUES', 'INSUFFICIENT_EVIDENCE', 'MATERIAL_RED_FLAGS');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PROPOSED_UNVERIFIED', 'FROZEN_PENDING_CONFIRMATION', 'CONFIRMED_WITHIN_SCOPE', 'REJECTED', 'SUPERSEDED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."review_result" AS ENUM('PASS', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('ADMIN', 'ANALYST', 'REVIEWER');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('CONTEXTUAL', 'MINOR', 'MATERIAL', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."source_category" AS ENUM('AUTHORITATIVE', 'FIRST_PARTY', 'CLIENT_SUPPLIED', 'INDEPENDENT_CONFIRMATION', 'THIRD_PARTY', 'UNVERIFIED');--> statement-breakpoint
CREATE TYPE "public"."time_activity" AS ENUM('INTAKE', 'SOURCE_CHECKS', 'ANALYSIS', 'CLIENT_COMMS', 'REPORT', 'QC', 'OTHER');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"case_id" uuid,
	"action" varchar(80) NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" varchar(20) NOT NULL,
	"client_id" uuid NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"depth" "service_depth" DEFAULT 'DIGITAL' NOT NULL,
	"status" "case_status" DEFAULT 'DRAFT' NOT NULL,
	"decision_purpose" text NOT NULL,
	"decision_owner" varchar(160),
	"requester_name" varchar(160),
	"requester_email" varchar(254),
	"goods_services" text,
	"amount" numeric(16, 2),
	"currency" varchar(3) DEFAULT 'KES' NOT NULL,
	"expected_payment_date" date,
	"is_new_supplier" boolean DEFAULT true NOT NULL,
	"permitted_contacts" text,
	"commissioning_authority_confirmed" boolean DEFAULT false NOT NULL,
	"lawful_basis_note" text,
	"exclusions" text,
	"fee_kes" integer,
	"direct_costs_kes" integer DEFAULT 0 NOT NULL,
	"analyst_id" uuid,
	"created_by_id" uuid NOT NULL,
	"outcome" "verification_outcome",
	"outcome_summary" text,
	"next_steps" text,
	"version" integer DEFAULT 1 NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"contact_name" varchar(120),
	"contact_email" varchar(254),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" varchar(300) NOT NULL,
	"country" varchar(2) DEFAULT 'KE' NOT NULL,
	"entity_type" varchar(80),
	"registration_number" varchar(80),
	"registration_authority" varchar(120),
	"kra_pin" varchar(20),
	"trading_names" text,
	"domain" varchar(253),
	"registered_address" text,
	"operating_address" text,
	"sector" varchar(120),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discrepancies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"code" varchar(8) NOT NULL,
	"severity" "severity" NOT NULL,
	"state" "discrepancy_state" DEFAULT 'OPEN' NOT NULL,
	"established" boolean DEFAULT false NOT NULL,
	"description" text NOT NULL,
	"explanation" text,
	"effect" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"stored_name" varchar(120) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"doc_type" varchar(60) NOT NULL,
	"source" text,
	"received_date" date,
	"uploaded_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"code" varchar(12) NOT NULL,
	"source_name" varchar(200) NOT NULL,
	"authority" varchar(200),
	"category" "source_category" NOT NULL,
	"access_result" "access_result" NOT NULL,
	"url" text,
	"locator" varchar(300),
	"checked_date" date NOT NULL,
	"summary" text NOT NULL,
	"confidence" "confidence" DEFAULT 'NOT_ASSESSED' NOT NULL,
	"rights_note" text,
	"document_id" uuid,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finding_evidence" (
	"finding_id" uuid NOT NULL,
	"evidence_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"layer" "layer" NOT NULL,
	"status" "finding_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"critical" boolean DEFAULT true NOT NULL,
	"scope_change_note" text,
	"finding" text,
	"confidence" "confidence" DEFAULT 'NOT_ASSESSED' NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instruction_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_instructions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"case_id" uuid,
	"status" "payment_status" DEFAULT 'PROPOSED_UNVERIFIED' NOT NULL,
	"is_change" boolean DEFAULT false NOT NULL,
	"previous_instruction_id" uuid,
	"beneficiary_name" varchar(300) NOT NULL,
	"bank_name" varchar(160) NOT NULL,
	"branch" varchar(160),
	"account_enc" text NOT NULL,
	"account_last4" varchar(4) NOT NULL,
	"currency" varchar(3) DEFAULT 'KES' NOT NULL,
	"source_description" text NOT NULL,
	"requested_effective_date" date,
	"confirmation_channel" text,
	"channel_established_how" text,
	"channel_independent" boolean,
	"confirmed_with_name" varchar(160),
	"confirmed_with_role" varchar(160),
	"confirmation_notes" text,
	"confirmed_at" timestamp with time zone,
	"confirmation_recorded_by_id" uuid,
	"decision_note" text,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"case_version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"released_by_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "representatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"claimed_role" varchar(160),
	"email" varchar(254),
	"phone" varchar(40),
	"how_introduced" text,
	"mandate_evidence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"case_version" integer NOT NULL,
	"result" "review_result" NOT NULL,
	"checklist" jsonb NOT NULL,
	"defects" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"activity" time_activity NOT NULL,
	"work_date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"name" varchar(120) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'ANALYST' NOT NULL,
	"totp_secret_enc" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_analyst_id_users_id_fk" FOREIGN KEY ("analyst_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_evidence" ADD CONSTRAINT "finding_evidence_evidence_id_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."evidence"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_instruction_id_payment_instructions_id_fk" FOREIGN KEY ("instruction_id") REFERENCES "public"."payment_instructions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_approvals" ADD CONSTRAINT "payment_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_confirmation_recorded_by_id_users_id_fk" FOREIGN KEY ("confirmation_recorded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instructions" ADD CONSTRAINT "payment_instructions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_released_by_id_users_id_fk" FOREIGN KEY ("released_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "representatives" ADD CONSTRAINT "representatives_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_case_idx" ON "audit_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cases_reference_idx" ON "cases" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "counterparties_name_idx" ON "counterparties" USING btree ("legal_name");--> statement-breakpoint
CREATE INDEX "counterparties_pin_idx" ON "counterparties" USING btree ("kra_pin");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_case_code_idx" ON "evidence" USING btree ("case_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "finding_evidence_pk" ON "finding_evidence" USING btree ("finding_id","evidence_id");--> statement-breakpoint
CREATE UNIQUE INDEX "findings_case_layer_idx" ON "findings" USING btree ("case_id","layer");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_approvals_unique" ON "payment_approvals" USING btree ("instruction_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");