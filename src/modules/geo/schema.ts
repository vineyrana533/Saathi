import { sql } from 'drizzle-orm';
import { check, doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const cities = pgTable(
  'cities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    state: text('state').notNull(),
    region: text('region').notNull(),
    status: text('status').notNull().default('configured'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cities_slug_uq').on(t.slug),
    check('cities_status_chk', sql`${t.status} in ('configured','live','paused')`),
  ],
);

export const zones = pgTable(
  'zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('zones_city_slug_uq').on(t.cityId, t.slug)],
);

/**
 * Neighbourhoods inside a zone with an approximate centre point, used to measure how far a worker
 * is from a job (decisions.md T-45). Centres are hand-entered approximations to about a kilometre,
 * good enough for "about 4 km away"; road travel time needs a map vendor (step 2).
 */
export const localities = pgTable(
  'localities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
  },
  (t) => [
    uniqueIndex('localities_city_slug_uq').on(t.cityId, t.slug),
    index('localities_zone_idx').on(t.zoneId),
    // Inside India's bounding box, so a swapped latitude and longitude cannot slip in.
    check('localities_point_chk', sql`${t.lat} between 6 and 38 and ${t.lng} between 68 and 98`),
  ],
);
