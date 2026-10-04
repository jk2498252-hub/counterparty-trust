ALTER TABLE "evidence" ADD COLUMN "valid_until" date;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "recheck_on" date;--> statement-breakpoint
ALTER TABLE "evidence" ADD COLUMN "validity_note" text;