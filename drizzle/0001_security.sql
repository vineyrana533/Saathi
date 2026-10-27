-- Security, integrity and isolation layer. Hand-written; see docs/database-design.md sections 3 and 4.
-- Runs as the owner role. The application connects as saathi_app (not owner, no BYPASSRLS),
-- so every policy below applies to every application query.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- 1. Application role (password and LOGIN are set outside migrations, per environment).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'saathi_app') THEN
    CREATE ROLE saathi_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO saathi_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO saathi_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO saathi_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO saathi_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO saathi_app;
--> statement-breakpoint

-- 2. Request context helpers. Values are set per transaction by withDb() with set_config(..., true).
CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_roles() RETURNS text[] LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN coalesce(current_setting('app.roles', true), '') = '' THEN ARRAY[]::text[]
              ELSE string_to_array(current_setting('app.roles', true), ',') END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_has_role(r text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT r = ANY(app_roles())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_system() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_has_role('system')
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_staff() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_roles() && ARRAY['admin','ops','verifier','finance','support']::text[]
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_privileged() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_is_system() OR app_is_staff()
$$;
--> statement-breakpoint
-- SECURITY DEFINER helpers run as the owner (RLS not forced for the owner), which avoids policy recursion.
CREATE OR REPLACE FUNCTION app_worker_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM worker_profiles WHERE user_id = app_user_id()
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_booking_customer(b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM bookings WHERE id = b AND customer_user_id = app_user_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_booking_worker(b uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM booking_assignments WHERE booking_id = b AND worker_id = app_worker_id())
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_is_booking_participant(b uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT app_is_booking_customer(b) OR app_is_booking_worker(b)
$$;
--> statement-breakpoint
-- A worker may see the name of customers they have a booking with.
CREATE OR REPLACE FUNCTION app_can_see_user(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM bookings b JOIN booking_assignments a ON a.booking_id = b.id
    WHERE b.customer_user_id = u AND a.worker_id = app_worker_id()
  )
$$;
--> statement-breakpoint

-- 3. Double-booking guard.
ALTER TABLE booking_assignments
  ADD COLUMN slot tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;
--> statement-breakpoint
ALTER TABLE booking_assignments
  ADD CONSTRAINT booking_assignments_no_overlap
  EXCLUDE USING gist (worker_id WITH =, slot WITH &&) WHERE (status = 'active');
--> statement-breakpoint

-- 4. Ledger: balanced journals, immutable lines and entries.
-- SECURITY DEFINER: deferred checks run at commit under the caller's RLS context, which may not
-- see every line of the journal (a worker sees only their own payable line).
CREATE OR REPLACE FUNCTION ledger_check_balance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d bigint; c bigint;
BEGIN
  SELECT coalesce(sum(debit_paise), 0), coalesce(sum(credit_paise), 0) INTO d, c
  FROM ledger_lines WHERE journal_id = NEW.journal_id;
  IF d <> c THEN
    RAISE EXCEPTION 'unbalanced journal %: debits % credits %', NEW.journal_id, d, c USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER ledger_lines_balanced
  AFTER INSERT ON ledger_lines DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_check_balance();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END $$;
--> statement-breakpoint
CREATE TRIGGER ledger_lines_immutable BEFORE UPDATE OR DELETE ON ledger_lines
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
--> statement-breakpoint

-- 5. Booking status transitions allowed for every role (docs/booking-lifecycle.md section 1).
CREATE OR REPLACE FUNCTION booking_status_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF (OLD.status, NEW.status) IN (
    ('pending_payment','confirmed'), ('pending_payment','expired'), ('pending_payment','cancelled'),
    ('confirmed','in_progress'), ('confirmed','cancelled'), ('confirmed','no_show_worker'), ('confirmed','no_show_customer'),
    ('in_progress','completed'), ('in_progress','disputed'),
    ('completed','disputed'), ('disputed','completed'), ('disputed','refunded')
  ) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'illegal booking transition % -> %', OLD.status, NEW.status USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
CREATE TRIGGER bookings_status_guard BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION booking_status_guard();
--> statement-breakpoint

-- 6. Workers cannot change their own verification, status or quality fields.
CREATE OR REPLACE FUNCTION worker_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF app_is_privileged() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'applicant' OR NEW.kyc_status <> 'not_started' OR NEW.rating_count <> 0 OR NEW.strikes <> 0
       OR NEW.photo_status NOT IN ('none','pending') THEN
      RAISE EXCEPTION 'protected worker fields' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status
     OR NEW.kyc_provider_ref IS DISTINCT FROM OLD.kyc_provider_ref OR NEW.id_number_masked IS DISTINCT FROM OLD.id_number_masked
     OR NEW.rating_avg_x100 IS DISTINCT FROM OLD.rating_avg_x100 OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
     OR NEW.strikes IS DISTINCT FROM OLD.strikes OR NEW.workforce_model IS DISTINCT FROM OLD.workforce_model
     OR NEW.organisation_id IS DISTINCT FROM OLD.organisation_id
     OR (NEW.photo_status IS DISTINCT FROM OLD.photo_status AND NEW.photo_status <> 'pending') THEN
    RAISE EXCEPTION 'protected worker fields' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER worker_profiles_guard BEFORE INSERT OR UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION worker_profile_guard();
--> statement-breakpoint

-- 7. Row-level security. ENABLE (not FORCE): the owner role bypasses, saathi_app does not.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY users_select ON users FOR SELECT USING (id = app_user_id() OR app_is_privileged() OR app_can_see_user(id));
--> statement-breakpoint
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (app_is_privileged());
--> statement-breakpoint
CREATE POLICY users_update ON users FOR UPDATE USING (id = app_user_id() OR app_is_privileged());
--> statement-breakpoint

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY user_roles_select ON user_roles FOR SELECT USING (user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY user_roles_write ON user_roles FOR ALL USING (app_is_system() OR app_has_role('admin'))
  WITH CHECK (app_is_system() OR app_has_role('admin'));
--> statement-breakpoint

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organisations_select ON organisations FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY organisations_write ON organisations FOR ALL USING (app_is_system() OR app_has_role('admin'))
  WITH CHECK (app_is_system() OR app_has_role('admin'));
--> statement-breakpoint

ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organisation_members_select ON organisation_members FOR SELECT
  USING (user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY organisation_members_write ON organisation_members FOR ALL USING (app_is_system() OR app_has_role('admin'))
  WITH CHECK (app_is_system() OR app_has_role('admin'));
--> statement-breakpoint

ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY otp_challenges_system ON otp_challenges FOR ALL USING (app_is_system()) WITH CHECK (app_is_system());
--> statement-breakpoint
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY sessions_system ON sessions FOR ALL USING (app_is_system()) WITH CHECK (app_is_system());
--> statement-breakpoint

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY consents_select ON consents FOR SELECT USING (user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY consents_insert ON consents FOR INSERT WITH CHECK (user_id = app_user_id() OR app_is_system());
--> statement-breakpoint
CREATE POLICY consents_update ON consents FOR UPDATE USING (user_id = app_user_id() OR app_is_system());
--> statement-breakpoint

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY audit_log_insert ON audit_log FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (app_has_role('admin') OR app_is_system());
--> statement-breakpoint

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY rate_limits_all ON rate_limits FOR ALL USING (true) WITH CHECK (true);
--> statement-breakpoint

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY jobs_insert ON jobs FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY jobs_manage ON jobs FOR ALL USING (app_is_privileged()) WITH CHECK (app_is_privileged());
--> statement-breakpoint
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY notification_outbox_insert ON notification_outbox FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY notification_outbox_manage ON notification_outbox FOR ALL USING (app_is_privileged()) WITH CHECK (app_is_privileged());
--> statement-breakpoint

-- Catalogue and configuration: public read, admin write.
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY feature_flags_select ON feature_flags FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY feature_flags_write ON feature_flags FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE config_values ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY config_values_select ON config_values FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY config_values_write ON config_values FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY cities_select ON cities FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY cities_write ON cities FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY zones_select ON zones FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY zones_write ON zones FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_categories_select ON service_categories FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY service_categories_write ON service_categories FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY services_select ON services FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY services_write ON services FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE service_cities ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY service_cities_select ON service_cities FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY service_cities_write ON service_cities FOR ALL USING (app_has_role('admin') OR app_is_system())
  WITH CHECK (app_has_role('admin') OR app_is_system());
--> statement-breakpoint

-- Workers.
ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_profiles_select ON worker_profiles FOR SELECT
  USING (status = 'active' OR user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY worker_profiles_insert ON worker_profiles FOR INSERT WITH CHECK (user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY worker_profiles_update ON worker_profiles FOR UPDATE USING (user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
ALTER TABLE worker_documents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_documents_select ON worker_documents FOR SELECT
  USING (worker_id = app_worker_id() OR app_has_role('verifier') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
CREATE POLICY worker_documents_insert ON worker_documents FOR INSERT
  WITH CHECK ((worker_id = app_worker_id() AND status = 'pending') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
CREATE POLICY worker_documents_update ON worker_documents FOR UPDATE
  USING (app_has_role('verifier') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE worker_service_approvals ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_service_approvals_select ON worker_service_approvals FOR SELECT
  USING (status = 'approved' OR worker_id = app_worker_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY worker_service_approvals_insert ON worker_service_approvals FOR INSERT
  WITH CHECK ((worker_id = app_worker_id() AND status = 'applied') OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY worker_service_approvals_update ON worker_service_approvals FOR UPDATE
  USING (app_has_role('verifier') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
ALTER TABLE worker_zones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_zones_select ON worker_zones FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY worker_zones_write ON worker_zones FOR ALL USING (worker_id = app_worker_id() OR app_is_privileged())
  WITH CHECK (worker_id = app_worker_id() OR app_is_privileged());
--> statement-breakpoint
ALTER TABLE worker_weekly_hours ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_weekly_hours_select ON worker_weekly_hours FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY worker_weekly_hours_write ON worker_weekly_hours FOR ALL USING (worker_id = app_worker_id() OR app_is_privileged())
  WITH CHECK (worker_id = app_worker_id() OR app_is_privileged());
--> statement-breakpoint
ALTER TABLE worker_time_off ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY worker_time_off_select ON worker_time_off FOR SELECT USING (worker_id = app_worker_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY worker_time_off_write ON worker_time_off FOR ALL USING (worker_id = app_worker_id() OR app_is_privileged())
  WITH CHECK (worker_id = app_worker_id() OR app_is_privileged());
--> statement-breakpoint

-- Bookings.
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY bookings_select ON bookings FOR SELECT
  USING (customer_user_id = app_user_id() OR app_is_booking_worker(id) OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY bookings_insert ON bookings FOR INSERT
  WITH CHECK ((customer_user_id = app_user_id() AND status = 'pending_payment') OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY bookings_update ON bookings FOR UPDATE
  USING (customer_user_id = app_user_id() OR app_is_booking_worker(id) OR app_is_privileged());
--> statement-breakpoint
ALTER TABLE booking_assignments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY booking_assignments_select ON booking_assignments FOR SELECT
  USING (app_is_booking_participant(booking_id) OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY booking_assignments_insert ON booking_assignments FOR INSERT
  WITH CHECK (app_is_booking_customer(booking_id) OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY booking_assignments_update ON booking_assignments FOR UPDATE
  USING (app_is_booking_participant(booking_id) OR app_is_privileged());
--> statement-breakpoint
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY booking_events_select ON booking_events FOR SELECT
  USING (app_is_booking_participant(booking_id) OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY booking_events_insert ON booking_events FOR INSERT
  WITH CHECK (app_is_booking_participant(booking_id) OR app_is_privileged());
--> statement-breakpoint

-- Money: written only by the system context; read by finance and the parties concerned.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payments_select ON payments FOR SELECT
  USING (app_is_booking_customer(booking_id) OR app_has_role('finance') OR app_has_role('admin')
         OR app_has_role('ops') OR app_has_role('support') OR app_is_system());
--> statement-breakpoint
CREATE POLICY payments_insert ON payments FOR INSERT
  WITH CHECK ((app_is_booking_customer(booking_id) AND status = 'created') OR app_is_system());
--> statement-breakpoint
CREATE POLICY payments_update ON payments FOR UPDATE USING (app_is_system());
--> statement-breakpoint
ALTER TABLE payment_webhook_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY payment_webhook_events_select ON payment_webhook_events FOR SELECT
  USING (app_has_role('finance') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
CREATE POLICY payment_webhook_events_write ON payment_webhook_events FOR ALL USING (app_is_system()) WITH CHECK (app_is_system());
--> statement-breakpoint
ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ledger_accounts_select ON ledger_accounts FOR SELECT
  USING (owner_id = app_worker_id() OR app_has_role('finance') OR app_has_role('admin') OR app_is_system());
--> statement-breakpoint
CREATE POLICY ledger_accounts_write ON ledger_accounts FOR ALL USING (app_is_system()) WITH CHECK (app_is_system());
--> statement-breakpoint
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY journal_entries_select ON journal_entries FOR SELECT
  USING (app_has_role('finance') OR app_has_role('admin') OR app_is_system()
         OR (booking_id IS NOT NULL AND app_is_booking_worker(booking_id)));
--> statement-breakpoint
CREATE POLICY journal_entries_insert ON journal_entries FOR INSERT WITH CHECK (app_is_system());
--> statement-breakpoint
ALTER TABLE ledger_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ledger_lines_select ON ledger_lines FOR SELECT
  USING (app_has_role('finance') OR app_has_role('admin') OR app_is_system()
         OR account_id IN (SELECT id FROM ledger_accounts WHERE owner_id = app_worker_id()));
--> statement-breakpoint
CREATE POLICY ledger_lines_insert ON ledger_lines FOR INSERT WITH CHECK (app_is_system());
--> statement-breakpoint

-- Chat, moderation, reports, ratings, waitlist.
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY chat_messages_select ON chat_messages FOR SELECT
  USING ((app_is_booking_participant(booking_id) AND (status = 'delivered' OR sender_user_id = app_user_id()))
         OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT
  WITH CHECK ((sender_user_id = app_user_id() AND app_is_booking_participant(booking_id)) OR app_is_system());
--> statement-breakpoint
ALTER TABLE moderation_flags ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY moderation_flags_insert ON moderation_flags FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY moderation_flags_manage ON moderation_flags FOR ALL USING (app_is_privileged()) WITH CHECK (app_is_privileged());
--> statement-breakpoint
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reports_insert ON reports FOR INSERT WITH CHECK (reporter_user_id = app_user_id() OR app_is_system());
--> statement-breakpoint
CREATE POLICY reports_select ON reports FOR SELECT USING (reporter_user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY reports_update ON reports FOR UPDATE USING (app_is_privileged());
--> statement-breakpoint
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY ratings_select ON ratings FOR SELECT
  USING (status = 'visible' OR rater_user_id = app_user_id() OR ratee_user_id = app_user_id() OR app_is_privileged());
--> statement-breakpoint
CREATE POLICY ratings_insert ON ratings FOR INSERT
  WITH CHECK ((rater_user_id = app_user_id() AND app_is_booking_participant(booking_id)) OR app_is_system());
--> statement-breakpoint
CREATE POLICY ratings_update ON ratings FOR UPDATE USING (app_is_privileged());
--> statement-breakpoint
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY waitlist_entries_insert ON waitlist_entries FOR INSERT WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY waitlist_entries_select ON waitlist_entries FOR SELECT USING (app_is_privileged());
--> statement-breakpoint

-- Functions are callable by the app role; SECURITY DEFINER ones are owned by the migration owner.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO saathi_app;
