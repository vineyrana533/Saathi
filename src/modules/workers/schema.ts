import { sql } from 'drizzle-orm';
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';
import { organisations, users } from '../identity/schema';
import { cities, localities, zones } from '../geo/schema';
import { services } from '../catalog/schema';

export const workerProfiles = pgTable(
  'worker_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    workforceModel: text('workforce_model').notNull().default('independent'),
    organisationId: uuid('organisation_id').references(() => organisations.id),
    displayName: text('display_name').notNull(),
    bio: text('bio').notNull().default(''),
    languages: text('languages').array().notNull().default(sql`'{}'::text[]`),
    gender: text('gender'),
    yearsExperience: smallint('years_experience').notNull().default(0),
    homeCityId: uuid('home_city_id').references(() => cities.id),
    status: text('status').notNull().default('applicant'),
    kycStatus: text('kyc_status').notNull().default('not_started'),
    kycProviderRef: text('kyc_provider_ref'),
    idNumberMasked: text('id_number_masked'),
    photoStatus: text('photo_status').notNull().default('none'),
    ratingAvgX100: integer('rating_avg_x100').notNull().default(0),
    ratingCount: integer('rating_count').notNull().default(0),
    strikes: integer('strikes').notNull().default(0),
    customerGenderPreference: text('customer_gender_preference').notNull().default('any'),
    /** Home base for distance matching. Stored to about a kilometre and never shown to anyone. */
    baseLocalityId: uuid('base_locality_id').references(() => localities.id),
    baseLat: doublePrecision('base_lat'),
    baseLng: doublePrecision('base_lng'),
    travelRadiusKm: smallint('travel_radius_km').notNull().default(10),
    searchIndexOptIn: boolean('search_index_opt_in').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('worker_profiles_user_uq').on(t.userId),
    check('worker_profiles_model_chk', sql`${t.workforceModel} in ('independent','company','agency')`),
    check('worker_profiles_status_chk', sql`${t.status} in ('applicant','active','suspended')`),
    check('worker_profiles_kyc_chk', sql`${t.kycStatus} in ('not_started','pending','verified','rejected')`),
    check('worker_profiles_photo_chk', sql`${t.photoStatus} in ('none','pending','approved','rejected')`),
    check('worker_profiles_gender_chk', sql`${t.gender} is null or ${t.gender} in ('female','male','non_binary','prefer_not_to_say')`),
    check('worker_profiles_pref_chk', sql`${t.customerGenderPreference} in ('any','female','male')`),
    check('worker_profiles_radius_chk', sql`${t.travelRadiusKm} between 1 and 50`),
    check('worker_profiles_base_chk', sql`(${t.baseLat} is null) = (${t.baseLng} is null)`),
  ],
);

export const workerDocuments = pgTable(
  'worker_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workerProfiles.id),
    docType: text('doc_type').notNull(),
    status: text('status').notNull().default('pending'),
    numberMasked: text('number_masked'),
    issuedOn: date('issued_on', { mode: 'string' }),
    expiresOn: date('expires_on', { mode: 'string' }),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    storageKey: text('storage_key'),
    sha256: text('sha256'),
    mimeType: text('mime_type'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('worker_documents_lookup_idx').on(t.workerId, t.docType, t.status, t.expiresOn),
    check(
      'worker_documents_type_chk',
      sql`${t.docType} in ('driving_licence','police_certificate','id_proof','selfie','profile_photo','caregiver_training','first_aid_certificate','nursing_registration','medical_qualification')`,
    ),
    check('worker_documents_status_chk', sql`${t.status} in ('pending','approved','rejected','expired')`),
  ],
);

export const workerServiceApprovals = pgTable(
  'worker_service_approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workerProfiles.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    status: text('status').notNull().default('applied'),
    reason: text('reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('worker_service_approvals_uq').on(t.workerId, t.serviceId),
    index('worker_service_approvals_service_idx').on(t.serviceId, t.status),
    check('worker_service_approvals_status_chk', sql`${t.status} in ('applied','approved','rejected','suspended')`),
  ],
);

export const workerZones = pgTable(
  'worker_zones',
  {
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workerProfiles.id),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
  },
  (t) => [primaryKey({ columns: [t.workerId, t.zoneId] })],
);

export const workerWeeklyHours = pgTable(
  'worker_weekly_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workerProfiles.id),
    /** 0 = Monday ... 6 = Sunday, Asia/Kolkata wall clock. */
    weekday: smallint('weekday').notNull(),
    startMinute: smallint('start_minute').notNull(),
    endMinute: smallint('end_minute').notNull(),
  },
  (t) => [
    index('worker_weekly_hours_worker_idx').on(t.workerId, t.weekday),
    check('worker_weekly_hours_weekday_chk', sql`${t.weekday} between 0 and 6`),
    check(
      'worker_weekly_hours_range_chk',
      sql`${t.startMinute} >= 0 and ${t.endMinute} <= 1440 and ${t.startMinute} < ${t.endMinute}`,
    ),
  ],
);

export const workerTimeOff = pgTable(
  'worker_time_off',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workerProfiles.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
  },
  (t) => [
    index('worker_time_off_worker_idx').on(t.workerId, t.startsAt),
    check('worker_time_off_range_chk', sql`${t.startsAt} < ${t.endsAt}`),
  ],
);
