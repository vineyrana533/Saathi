CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone_e164" text NOT NULL,
	"city_id" uuid NOT NULL,
	"need" text NOT NULL,
	"wanted_on" date,
	"source" text DEFAULT 'web' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"review_reasons" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enquiries_status_chk" CHECK ("enquiries"."status" in ('new','needs_review','contacted','closed')),
	CONSTRAINT "enquiries_need_len_chk" CHECK (char_length("enquiries"."need") between 5 and 1000)
);
--> statement-breakpoint
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY enquiries_insert ON enquiries FOR INSERT WITH CHECK (status IN ('new','needs_review'));
--> statement-breakpoint
CREATE POLICY enquiries_select ON enquiries FOR SELECT USING (app_is_privileged());
--> statement-breakpoint
CREATE POLICY enquiries_update ON enquiries FOR UPDATE USING (app_is_privileged());
