import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { cities } from '../geo/schema';
import type { PricingConfig, ServiceConfig } from './config';

export const serviceCategories = pgTable(
  'service_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    riskTier: text('risk_tier').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('service_categories_slug_uq').on(t.slug),
    check('service_categories_tier_chk', sql`${t.riskTier} in ('A','B','C')`),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    summary: text('summary').notNull(),
    riskTier: text('risk_tier').notNull(),
    bookingMode: text('booking_mode').notNull(),
    pricingModel: text('pricing_model').notNull(),
    config: jsonb('config').$type<ServiceConfig>().notNull(),
    featureFlagKey: text('feature_flag_key'),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('services_slug_uq').on(t.slug),
    check('services_tier_chk', sql`${t.riskTier} in ('A','B','C')`),
    check('services_mode_chk', sql`${t.bookingMode} in ('direct','assisted','both')`),
    check('services_pricing_chk', sql`${t.pricingModel} in ('hourly','daily','fixed','quote')`),
    check('services_status_chk', sql`${t.status} in ('draft','active','disabled')`),
  ],
);

export const serviceCities = pgTable(
  'service_cities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    status: text('status').notNull().default('waitlist'),
    pricing: jsonb('pricing').$type<PricingConfig>().notNull(),
    pricingVersion: integer('pricing_version').notNull().default(1),
    goLiveMinWorkers: integer('go_live_min_workers').notNull().default(10),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('service_cities_uq').on(t.serviceId, t.cityId),
    check('service_cities_status_chk', sql`${t.status} in ('waitlist','live','paused')`),
  ],
);
