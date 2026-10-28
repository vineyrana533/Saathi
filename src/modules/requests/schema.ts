import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cities } from '../geo/schema';

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
