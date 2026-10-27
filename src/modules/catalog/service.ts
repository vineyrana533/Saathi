import { and, asc, eq, sql } from 'drizzle-orm';
import { serviceCategories, serviceCities, services } from './schema';
import { pricingConfigSchema, serviceConfigSchema, type PricingConfig, type ServiceConfig } from './config';
import { cities } from '../geo/schema';
import { featureFlags } from '@/platform/db/platform-schema';
import { anonymousCtx, withDb, type Ctx, type Tx } from '@/platform/db/client';
import { requirePermission } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { invalid, notFound } from '@/platform/errors';

export interface ServiceInCity {
  service: typeof services.$inferSelect & { config: ServiceConfig };
  city: typeof cities.$inferSelect;
  serviceCity: typeof serviceCities.$inferSelect & { pricing: PricingConfig };
  categorySlug: string;
  flagEnabled: boolean;
}

/** Loads a service offered in a city with validated config. Returns null if either is missing. */
export async function loadServiceInCity(tx: Tx, serviceSlug: string, citySlug: string): Promise<ServiceInCity | null> {
  const rows = await tx
    .select({ service: services, city: cities, serviceCity: serviceCities, categorySlug: serviceCategories.slug })
    .from(serviceCities)
    .innerJoin(services, eq(services.id, serviceCities.serviceId))
    .innerJoin(cities, eq(cities.id, serviceCities.cityId))
    .innerJoin(serviceCategories, eq(serviceCategories.id, services.categoryId))
    .where(and(eq(services.slug, serviceSlug), eq(cities.slug, citySlug)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  let flagEnabled = true;
  if (row.service.featureFlagKey) {
    const [flag] = await tx.select().from(featureFlags).where(eq(featureFlags.key, row.service.featureFlagKey)).limit(1);
    flagEnabled = !!flag?.enabled;
  }
  return {
    service: { ...row.service, config: serviceConfigSchema.parse(row.service.config) },
    city: row.city,
    serviceCity: { ...row.serviceCity, pricing: pricingConfigSchema.parse(row.serviceCity.pricing) },
    categorySlug: row.categorySlug,
    flagEnabled,
  };
}

/**
 * Whether customers can book this service here at all. Tier C is never bookable at launch;
 * Tier B needs its feature flag; any service needs status active and the city-service live.
 * Supply threshold is checked separately (seo/service.ts) because it needs a worker count.
 */
export function isOfferable(s: ServiceInCity): boolean {
  if (s.service.status !== 'active') return false;
  if (s.service.riskTier === 'C') return false;
  if (s.service.riskTier === 'B' && !s.flagEnabled) return false;
  if (s.service.featureFlagKey && !s.flagEnabled) return false;
  return s.serviceCity.status === 'live';
}

export async function getServiceInCity(serviceSlug: string, citySlug: string) {
  return withDb(anonymousCtx(), (tx) => loadServiceInCity(tx, serviceSlug, citySlug));
}

export async function listServiceCityPairs() {
  return withDb(anonymousCtx(), (tx) =>
    tx
      .select({
        serviceCityId: serviceCities.id,
        serviceSlug: services.slug,
        serviceName: services.name,
        serviceSummary: services.summary,
        riskTier: services.riskTier,
        serviceStatus: services.status,
        citySlug: cities.slug,
        cityName: cities.name,
        status: serviceCities.status,
        pricing: serviceCities.pricing,
        pricingVersion: serviceCities.pricingVersion,
        goLiveMinWorkers: serviceCities.goLiveMinWorkers,
      })
      .from(serviceCities)
      .innerJoin(services, eq(services.id, serviceCities.serviceId))
      .innerJoin(cities, eq(cities.id, serviceCities.cityId))
      .orderBy(asc(services.name), asc(cities.name)),
  );
}

export async function listCategoriesWithServices() {
  return withDb(anonymousCtx(), async (tx) => {
    const cats = await tx.select().from(serviceCategories).orderBy(asc(serviceCategories.sortOrder));
    const svcs = await tx.select().from(services).orderBy(asc(services.name));
    return cats.map((c) => ({ ...c, services: svcs.filter((s) => s.categoryId === c.id) }));
  });
}

/**
 * Admin price change. Bumps pricing_version; confirmed bookings keep their own snapshot,
 * so this never changes a booking that already exists.
 */
export async function updateServiceCityPricing(ctx: Ctx, input: { serviceCityId: string; pricing: unknown }) {
  requirePermission(ctx, 'catalog.manage');
  const parsed = pricingConfigSchema.safeParse(input.pricing);
  if (!parsed.success) throw invalid('invalid_pricing', 'Pricing configuration is not valid', { issues: parsed.error.issues });
  return withDb(ctx, async (tx) => {
    const [before] = await tx.select().from(serviceCities).where(eq(serviceCities.id, input.serviceCityId)).limit(1);
    if (!before) throw notFound('Service in city');
    const [after] = await tx
      .update(serviceCities)
      .set({ pricing: parsed.data, pricingVersion: sql`${serviceCities.pricingVersion} + 1`, updatedAt: sql`now()` })
      .where(eq(serviceCities.id, input.serviceCityId))
      .returning();
    await audit(tx, ctx, 'catalog.pricing_updated', 'service_city', input.serviceCityId, {
      from: before.pricing,
      to: parsed.data,
      version: after?.pricingVersion,
    });
    return after!;
  });
}

export async function setServiceCityStatus(ctx: Ctx, input: { serviceCityId: string; status: 'waitlist' | 'live' | 'paused' }) {
  requirePermission(ctx, 'catalog.manage');
  return withDb(ctx, async (tx) => {
    const [row] = await tx
      .update(serviceCities)
      .set({ status: input.status, updatedAt: sql`now()` })
      .where(eq(serviceCities.id, input.serviceCityId))
      .returning();
    if (!row) throw notFound('Service in city');
    await audit(tx, ctx, 'catalog.service_city_status', 'service_city', input.serviceCityId, { status: input.status });
    return row;
  });
}

export async function updateServiceConfig(ctx: Ctx, input: { serviceId: string; config: unknown }) {
  requirePermission(ctx, 'catalog.manage');
  const parsed = serviceConfigSchema.safeParse(input.config);
  if (!parsed.success) throw invalid('invalid_config', 'Service configuration is not valid', { issues: parsed.error.issues });
  return withDb(ctx, async (tx) => {
    const [row] = await tx
      .update(services)
      .set({ config: parsed.data, updatedAt: sql`now()` })
      .where(eq(services.id, input.serviceId))
      .returning();
    if (!row) throw notFound('Service');
    await audit(tx, ctx, 'catalog.service_config_updated', 'service', input.serviceId);
    return row;
  });
}
