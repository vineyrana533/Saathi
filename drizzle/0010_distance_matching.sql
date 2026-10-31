CREATE TABLE "localities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"city_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	CONSTRAINT "localities_point_chk" CHECK ("localities"."lat" between 6 and 38 and "localities"."lng" between 68 and 98)
);
--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "base_locality_id" uuid;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "base_lat" double precision;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "base_lng" double precision;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD COLUMN "travel_radius_km" smallint DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "locality_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "job_lat" double precision;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "job_lng" double precision;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "locality_id" uuid;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "job_lat" double precision;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "job_lng" double precision;--> statement-breakpoint
ALTER TABLE "localities" ADD CONSTRAINT "localities_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "localities" ADD CONSTRAINT "localities_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "localities_city_slug_uq" ON "localities" USING btree ("city_id","slug");--> statement-breakpoint
CREATE INDEX "localities_zone_idx" ON "localities" USING btree ("zone_id");--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_base_locality_id_localities_id_fk" FOREIGN KEY ("base_locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_locality_id_localities_id_fk" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_radius_chk" CHECK ("worker_profiles"."travel_radius_km" between 1 and 50);--> statement-breakpoint
ALTER TABLE "worker_profiles" ADD CONSTRAINT "worker_profiles_base_chk" CHECK (("worker_profiles"."base_lat" is null) = ("worker_profiles"."base_lng" is null));
--> statement-breakpoint
-- Localities are public reference data, like cities and zones.
ALTER TABLE localities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY localities_select ON localities FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY localities_write ON localities FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON localities FROM anon, authenticated';
  END IF;
END $$;
