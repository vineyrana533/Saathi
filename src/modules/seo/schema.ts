import { sql } from 'drizzle-orm';
import { check, date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { cities } from '../geo/schema';
import { services } from '../catalog/schema';

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    name: text('name').notNull(),
    phoneE164: text('phone_e164').notNull(),
    need: text('need').notNull(),
    wantedOn: date('wanted_on', { mode: 'string' }),
    /** Ops follow-up: new until someone from the team has called. */
    status: text('status').notNull().default('new'),
    contactedAt: timestamp('contacted_at', { withTimezone: true }),
    contactedBy: uuid('contacted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('waitlist_entries_city_service_idx').on(t.cityId, t.serviceId),
    index('waitlist_entries_status_idx').on(t.status, t.createdAt),
    check('waitlist_entries_status_chk', sql`${t.status} in ('new','contacted','closed')`),
  ],
);
