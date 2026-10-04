CREATE TABLE "app_locks" (
	"id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "failed_mfa_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO "app_locks" ("id") VALUES ('workflow');
