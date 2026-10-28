CREATE TABLE "customer_id_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"id_type" text NOT NULL,
	"number_masked" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"storage_key" text,
	"sha256" text,
	"mime_type" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_id_checks_status_chk" CHECK ("customer_id_checks"."status" in ('pending','approved','rejected')),
	CONSTRAINT "customer_id_checks_type_chk" CHECK ("customer_id_checks"."id_type" in ('aadhaar','pan','voter_id','passport','driving_licence'))
);
--> statement-breakpoint
ALTER TABLE "customer_id_checks" ADD CONSTRAINT "customer_id_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_id_checks" ADD CONSTRAINT "customer_id_checks_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_id_checks_user_idx" ON "customer_id_checks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "customer_id_checks_status_idx" ON "customer_id_checks" USING btree ("status","created_at");--> statement-breakpoint
-- A customer sees and submits only their own ID checks; verifiers and admins review them. No deletes.
ALTER TABLE customer_id_checks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY customer_id_checks_select ON customer_id_checks FOR SELECT
  USING (user_id = app_user_id() OR app_has_role('verifier') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
CREATE POLICY customer_id_checks_insert ON customer_id_checks FOR INSERT
  WITH CHECK ((user_id = app_user_id() AND status = 'pending' AND reviewed_by IS NULL) OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
CREATE POLICY customer_id_checks_update ON customer_id_checks FOR UPDATE
  USING (app_has_role('verifier') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
-- Same Supabase Data API lockdown as 0006, in case default privileges were changed since.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON customer_id_checks FROM anon, authenticated';
  END IF;
END $$;
--> statement-breakpoint
-- Owner decision of 28 Oct 2026 (decisions.md T-31): every service is bookable online in Delhi NCR,
-- including Tier C. On a fresh database these updates match nothing and the seed inserts the same values.
UPDATE service_categories SET name = 'Care at home' WHERE slug = 'care';
--> statement-breakpoint
UPDATE service_categories SET name = 'Help at home' WHERE slug = 'home-help';
--> statement-breakpoint
UPDATE services SET status = 'active', booking_mode = 'both', updated_at = now()
  WHERE slug IN ('elder-care', 'domestic-help', 'medical-support');
--> statement-breakpoint
UPDATE services SET booking_mode = 'both', updated_at = now() WHERE slug = 'event-staff';
--> statement-breakpoint
UPDATE feature_flags SET enabled = true, updated_at = now()
  WHERE key IN ('category.elder-care', 'category.domestic-help', 'category.medical-support');
--> statement-breakpoint
UPDATE service_cities sc SET status = 'live', updated_at = now()
  FROM services s, cities c
  WHERE s.id = sc.service_id AND c.id = sc.city_id
    AND s.slug IN ('event-staff', 'errands', 'elder-care', 'domestic-help', 'medical-support')
    AND c.slug IN ('delhi', 'noida', 'gurugram') AND sc.status = 'waitlist';
--> statement-breakpoint
-- Placeholder prices pending owner sign-off (decisions.md P-09), set only where no price exists yet.
-- Bumping pricing_version keeps every existing booking on its own snapshot.
UPDATE service_cities sc
  SET pricing = jsonb_set(sc.pricing, '{hourlyRatePaise}', to_jsonb(v.rate)), pricing_version = sc.pricing_version + 1, updated_at = now()
  FROM services s, (VALUES ('elder-care', 20000), ('domestic-help', 15000), ('medical-support', 35000)) AS v(slug, rate)
  WHERE s.id = sc.service_id AND s.slug = v.slug AND coalesce((sc.pricing->>'hourlyRatePaise')::int, 0) = 0;
