import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('waitlist_entries_city_service_idx').on(t.cityId, t.serviceId)],
);
