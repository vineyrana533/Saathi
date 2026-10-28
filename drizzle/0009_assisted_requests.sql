CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"workers_count" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"hourly_rate_paise" integer NOT NULL,
	"price_snapshot" jsonb NOT NULL,
	"total_paise" bigint NOT NULL,
	"pricing_version" integer NOT NULL,
	"proposed_worker_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"message_to_customer" text,
	"customer_note" text,
	"expires_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"booking_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_status_chk" CHECK ("quotes"."status" in ('draft','sent','accepted','change_requested','declined','expired','withdrawn')),
	CONSTRAINT "quotes_workers_chk" CHECK ("quotes"."workers_count" between 1 and 50),
	CONSTRAINT "quotes_time_chk" CHECK ("quotes"."starts_at" < "quotes"."ends_at"),
	CONSTRAINT "quotes_amounts_chk" CHECK ("quotes"."total_paise" >= 0 and "quotes"."hourly_rate_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_user_id" uuid,
	"actor_role" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"customer_user_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"city_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"workers_needed" integer DEFAULT 1 NOT NULL,
	"address_line" text NOT NULL,
	"landmark" text,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"budget_paise" bigint,
	"status" text DEFAULT 'submitted' NOT NULL,
	"owner_user_id" uuid,
	"first_response_due_at" timestamp with time zone NOT NULL,
	"first_responded_at" timestamp with time zone,
	"booking_id" uuid,
	"closed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_requests_status_chk" CHECK ("service_requests"."status" in ('submitted','in_review','sourcing','quoted','accepted','declined','expired','cancelled')),
	CONSTRAINT "service_requests_workers_chk" CHECK ("service_requests"."workers_needed" between 1 and 50),
	CONSTRAINT "service_requests_time_chk" CHECK ("service_requests"."starts_at" < "service_requests"."ends_at"),
	CONSTRAINT "service_requests_budget_chk" CHECK ("service_requests"."budget_paise" is null or "service_requests"."budget_paise" >= 0),
	CONSTRAINT "service_requests_details_len_chk" CHECK (char_length("service_requests"."details") <= 1000)
);
--> statement-breakpoint
DROP INDEX "ratings_booking_direction_uq";--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "workers_needed" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_request_events" ADD CONSTRAINT "service_request_events_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_request_version_uq" ON "quotes" USING btree ("request_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_one_open_uq" ON "quotes" USING btree ("request_id") WHERE status in ('draft','sent');--> statement-breakpoint
CREATE INDEX "quotes_expiry_idx" ON "quotes" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "service_request_events_request_idx" ON "service_request_events" USING btree ("request_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_requests_ref_uq" ON "service_requests" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "service_requests_customer_idx" ON "service_requests" USING btree ("customer_user_id","created_at");--> statement-breakpoint
CREATE INDEX "service_requests_queue_idx" ON "service_requests" USING btree ("status","first_response_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_booking_pair_uq" ON "ratings" USING btree ("booking_id","rater_user_id","ratee_user_id");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workers_chk" CHECK ("bookings"."workers_needed" between 1 and 50);
--> statement-breakpoint
-- Milestone 2: assisted requests and quotes (docs/booking-lifecycle.md sections 5 and 6).
-- SECURITY DEFINER like the booking helpers, so policies can check ownership without recursion.
CREATE OR REPLACE FUNCTION app_is_request_customer(r uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM service_requests WHERE id = r AND customer_user_id = app_user_id())
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app_is_request_customer(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_is_request_customer(uuid) TO saathi_app;
--> statement-breakpoint
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_requests_select ON service_requests FOR SELECT
  USING (customer_user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY service_requests_insert ON service_requests FOR INSERT
  WITH CHECK ((customer_user_id = app_user_id() AND status = 'submitted' AND owner_user_id IS NULL AND booking_id IS NULL) OR app_is_privileged());
--> statement-breakpoint
-- Customer actions (cancel, decline, accept) run in system scope after the service checks ownership.
CREATE POLICY service_requests_update ON service_requests FOR UPDATE USING (app_is_privileged());
--> statement-breakpoint
ALTER TABLE service_request_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_request_events_select ON service_request_events FOR SELECT
  USING (app_is_request_customer(request_id) OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY service_request_events_insert ON service_request_events FOR INSERT
  WITH CHECK (app_is_request_customer(request_id) OR app_is_privileged());
--> statement-breakpoint
CREATE TRIGGER service_request_events_immutable BEFORE UPDATE OR DELETE ON service_request_events
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Customers never see drafts.
CREATE POLICY quotes_select ON quotes FOR SELECT
  USING ((status <> 'draft' AND app_is_request_customer(request_id)) OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY quotes_insert ON quotes FOR INSERT WITH CHECK (app_is_privileged());
--> statement-breakpoint
CREATE POLICY quotes_update ON quotes FOR UPDATE USING (app_is_privileged());
--> statement-breakpoint
-- Request status transitions allowed for every role (docs/booking-lifecycle.md section 5).
CREATE OR REPLACE FUNCTION service_request_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) IN (
    ('submitted','in_review'), ('submitted','sourcing'), ('submitted','quoted'),
    ('in_review','sourcing'), ('in_review','quoted'), ('sourcing','in_review'), ('sourcing','quoted'),
    ('quoted','in_review'), ('quoted','accepted'), ('quoted','declined'),
    ('submitted','cancelled'), ('in_review','cancelled'), ('sourcing','cancelled'), ('quoted','cancelled'),
    ('submitted','expired'), ('in_review','expired'), ('sourcing','expired'), ('quoted','expired'),
    ('expired','in_review')
  ) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'illegal request transition % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER service_requests_status_guard BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION service_request_status_guard();
--> statement-breakpoint
-- Quote transitions (section 6). A sent quote keeps its price, people and times; a quote that has
-- left draft or sent never changes again.
CREATE OR REPLACE FUNCTION quote_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'quote % is final', OLD.id USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'sent' AND (NEW.workers_count, NEW.starts_at, NEW.ends_at, NEW.duration_minutes, NEW.hourly_rate_paise,
      NEW.price_snapshot, NEW.total_paise, NEW.proposed_worker_ids, NEW.expires_at, NEW.message_to_customer)
      IS DISTINCT FROM (OLD.workers_count, OLD.starts_at, OLD.ends_at, OLD.duration_minutes, OLD.hourly_rate_paise,
      OLD.price_snapshot, OLD.total_paise, OLD.proposed_worker_ids, OLD.expires_at, OLD.message_to_customer) THEN
    RAISE EXCEPTION 'a sent quote cannot be edited' USING ERRCODE = '23514';
  END IF;
  IF NEW.status <> OLD.status AND (OLD.status, NEW.status) NOT IN (
    ('draft','sent'), ('draft','withdrawn'),
    ('sent','accepted'), ('sent','change_requested'), ('sent','declined'), ('sent','expired'), ('sent','withdrawn')
  ) THEN
    RAISE EXCEPTION 'illegal quote transition % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER quotes_guard BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION quote_guard();
--> statement-breakpoint
CREATE TRIGGER quotes_no_delete BEFORE DELETE ON quotes FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
-- Same Supabase Data API lockdown as 0006 for the new tables.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON service_requests, service_request_events, quotes FROM anon, authenticated';
  END IF;
END $$;
--> statement-breakpoint
-- Request limits per service (decisions.md T-36): online booking stays one person, requests can ask for a team.
UPDATE services SET config = jsonb_set(config, '{workersRequired,max}', to_jsonb(v.max)), updated_at = now()
  FROM (VALUES ('event-staff', 50), ('domestic-help', 3), ('errands', 5), ('personal-driver', 10)) AS v(slug, max)
  WHERE services.slug = v.slug;
