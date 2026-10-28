ALTER TABLE "waitlist_entries" ADD COLUMN "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD COLUMN "contacted_by" uuid;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "contacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enquiries" ADD COLUMN "contacted_by" uuid;--> statement-breakpoint
CREATE INDEX "waitlist_entries_status_idx" ON "waitlist_entries" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_status_chk" CHECK ("waitlist_entries"."status" in ('new','contacted','closed'));--> statement-breakpoint
-- Ops staff mark sign-ups as contacted; the public can still only insert.
CREATE POLICY waitlist_entries_update ON waitlist_entries FOR UPDATE USING (app_is_privileged());
