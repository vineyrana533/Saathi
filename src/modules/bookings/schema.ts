import { sql } from 'drizzle-orm';
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../identity/schema';
import { services } from '../catalog/schema';
import { cities, zones } from '../geo/schema';
import { workerProfiles } from '../workers/schema';
import type { PriceSnapshot } from '../pricing/engine';

export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
  'no_show_worker',
  'no_show_customer',
  'disputed',
  'refunded',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ref: text('ref').notNull(),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    status: text('status').$type<BookingStatus>().notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    addressLine: text('address_line').notNull(),
    landmark: text('landmark'),
    answers: jsonb('answers').$type<Record<string, string | number | boolean>>().notNull().default({}),
    priceSnapshot: jsonb('price_snapshot').$type<PriceSnapshot>().notNull(),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    pricingVersion: integer('pricing_version').notNull(),
    /** People paid for. Active assignments below this number is a partial fill that ops must fix. */
    workersNeeded: integer('workers_needed').notNull().default(1),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    startOtpHash: text('start_otp_hash'),
    endOtpHash: text('end_otp_hash'),
    /** AES-256-GCM copies, decrypted only for the booking customer (codes must be shown to them). */
    startOtpEnc: text('start_otp_enc'),
    endOtpEnc: text('end_otp_enc'),
    otpFailedAttempts: integer('otp_failed_attempts').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: text('cancelled_by'),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bookings_ref_uq').on(t.ref),
    index('bookings_customer_idx').on(t.customerUserId, t.startsAt),
    index('bookings_status_hold_idx').on(t.status, t.holdExpiresAt),
    check(
      'bookings_status_chk',
      sql`${t.status} in ('pending_payment','confirmed','in_progress','completed','cancelled','expired','no_show_worker','no_show_customer','disputed','refunded')`,
    ),
    check('bookings_time_chk', sql`${t.startsAt} < ${t.endsAt}`),
    check('bookings_total_chk', sql`${t.totalPaise} >= 0`),
    check('bookings_workers_chk', sql`${t.workersNeeded} between 1 and 50`),
  ],
);

/** `slot` (tstzrange) and the no-overlap exclusion constraint are added in drizzle/0001_security.sql. */
export const bookingAssignments = pgTable(
  'booking_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    workerId: uuid('worker_id')
      .notNull()
      .references(() => workerProfiles.id),
    status: text('status').notNull().default('active'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
  },
  (t) => [
    index('booking_assignments_booking_idx').on(t.bookingId),
    index('booking_assignments_worker_idx').on(t.workerId, t.status),
    check('booking_assignments_status_chk', sql`${t.status} in ('active','released')`),
  ],
);

export const bookingEvents = pgTable(
  'booking_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('booking_events_booking_idx').on(t.bookingId, t.at)],
);
