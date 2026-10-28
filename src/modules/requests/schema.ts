import { sql } from 'drizzle-orm';
import { bigint, check, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cities, zones } from '../geo/schema';
import { users } from '../identity/schema';
import { services } from '../catalog/schema';
import { bookings } from '../bookings/schema';
import type { PriceSnapshot } from '../pricing/engine';

/**
 * Free-form requests for work that is not a listed service ("something else").
 * A first slice of assisted matching (M07, Milestone 2) and CRM leads (M15): ops calls back.
 * RLS: anyone may insert; only staff may read or update (drizzle/0004_*.sql).
 */
export const enquiries = pgTable(
  'enquiries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    need: text('need').notNull(),
    wantedOn: date('wanted_on', { mode: 'string' }),
    source: text('source').notNull().default('web'),
    status: text('status').notNull().default('new'),
    reviewReasons: text('review_reasons').array().notNull().default(sql`'{}'::text[]`),
    contactedAt: timestamp('contacted_at', { withTimezone: true }),
    contactedBy: uuid('contacted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('enquiries_status_idx').on(t.status, t.createdAt),
    check('enquiries_status_chk', sql`${t.status} in ('new','needs_review','contacted','closed')`),
    check('enquiries_need_len_chk', sql`char_length(${t.need}) between 5 and 1000`),
  ],
);

export const REQUEST_STATUSES = ['submitted', 'in_review', 'sourcing', 'quoted', 'accepted', 'declined', 'expired', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
/** Statuses where the request still needs work from ops or an answer from the customer. */
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ['submitted', 'in_review', 'sourcing', 'quoted'];

/**
 * Assisted requests (M07, Milestone 2): a customer describes a job, ops sources people and sends
 * a quote. Allowed status changes are enforced by a trigger (drizzle/0009_*.sql) as well as in
 * the service. RLS: customers read their own; only staff, or the system after checks, update.
 */
export const serviceRequests = pgTable(
  'service_requests',
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
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    workersNeeded: integer('workers_needed').notNull().default(1),
    addressLine: text('address_line').notNull(),
    landmark: text('landmark'),
    answers: jsonb('answers').$type<Record<string, string | number | boolean>>().notNull().default({}),
    details: text('details').notNull().default(''),
    budgetPaise: bigint('budget_paise', { mode: 'number' }),
    status: text('status').$type<RequestStatus>().notNull().default('submitted'),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    firstResponseDueAt: timestamp('first_response_due_at', { withTimezone: true }).notNull(),
    firstRespondedAt: timestamp('first_responded_at', { withTimezone: true }),
    bookingId: uuid('booking_id').references(() => bookings.id),
    closedReason: text('closed_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('service_requests_ref_uq').on(t.ref),
    index('service_requests_customer_idx').on(t.customerUserId, t.createdAt),
    index('service_requests_queue_idx').on(t.status, t.firstResponseDueAt),
    check(
      'service_requests_status_chk',
      sql`${t.status} in ('submitted','in_review','sourcing','quoted','accepted','declined','expired','cancelled')`,
    ),
    check('service_requests_workers_chk', sql`${t.workersNeeded} between 1 and 50`),
    check('service_requests_time_chk', sql`${t.startsAt} < ${t.endsAt}`),
    check('service_requests_budget_chk', sql`${t.budgetPaise} is null or ${t.budgetPaise} >= 0`),
    check('service_requests_details_len_chk', sql`char_length(${t.details}) <= 1000`),
  ],
);

/** Status and owner history of a request. Append-only (trigger in drizzle/0009_*.sql). */
export const serviceRequestEvents = pgTable(
  'service_request_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id),
    fromStatus: text('from_status'),
    toStatus: text('to_status').notNull(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('service_request_events_request_idx').on(t.requestId, t.at)],
);

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'change_requested', 'declined', 'expired', 'withdrawn'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

/**
 * A priced offer for a request (M08). At most one draft or sent quote per request. Customers
 * never see drafts. While sent, a quote's price, people and times cannot change, and once it
 * leaves sent it is immutable (trigger). Accepting starts a booking with this exact snapshot.
 */
export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id),
    version: integer('version').notNull(),
    status: text('status').$type<QuoteStatus>().notNull().default('draft'),
    workersCount: integer('workers_count').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    hourlyRatePaise: integer('hourly_rate_paise').notNull(),
    priceSnapshot: jsonb('price_snapshot').$type<PriceSnapshot>().notNull(),
    totalPaise: bigint('total_paise', { mode: 'number' }).notNull(),
    pricingVersion: integer('pricing_version').notNull(),
    proposedWorkerIds: uuid('proposed_worker_ids').array().notNull().default(sql`'{}'::uuid[]`),
    messageToCustomer: text('message_to_customer'),
    customerNote: text('customer_note'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    bookingId: uuid('booking_id').references(() => bookings.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('quotes_request_version_uq').on(t.requestId, t.version),
    uniqueIndex('quotes_one_open_uq').on(t.requestId).where(sql`status in ('draft','sent')`),
    index('quotes_expiry_idx').on(t.status, t.expiresAt),
    check('quotes_status_chk', sql`${t.status} in ('draft','sent','accepted','change_requested','declined','expired','withdrawn')`),
    check('quotes_workers_chk', sql`${t.workersCount} between 1 and 50`),
    check('quotes_time_chk', sql`${t.startsAt} < ${t.endsAt}`),
    check('quotes_amounts_chk', sql`${t.totalPaise} >= 0 and ${t.hourlyRatePaise} >= 0`),
  ],
);
