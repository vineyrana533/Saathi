import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { waitlistEntries } from './schema';
import { serviceCities, services } from '../catalog/schema';
import { cities } from '../geo/schema';
import { loadServiceInCity } from '../catalog/service';
import { supplyStatus, type SupplyStatus } from './supply';
import { anonymousCtx, withDb, type Ctx } from '@/platform/db/client';
import { normaliseIndianMobile } from '@/platform/auth/phone';
import { enforceRateLimit, LIMITS } from '@/platform/rate-limit';
import { requirePermission } from '@/platform/auth/permissions';
import { notFound } from '@/platform/errors';
import { sql } from 'drizzle-orm';

/**
 * City and service landing pages (M23). Generated from the database; indexable only while
 * the city-service is live with enough verified supply (section 13 and 17).
 */
export async function getCityServicePage(citySlug: string, serviceSlug: string) {
  const ctx = anonymousCtx();
  return withDb(ctx, async (tx) => {
    const s = await loadServiceInCity(tx, serviceSlug, citySlug);
    if (!s || s.service.riskTier === 'C') return null;
    // Tier B pages do not exist publicly until the category is enabled.
    if (s.service.riskTier === 'B' && !s.flagEnabled) return null;
    const supply: SupplyStatus = await supplyStatus(tx, ctx, s);
    return { ...s, supply, indexable: supply.live };
  });
}

export interface SitemapEntry {
  path: string;
  lastModified: Date;
}

/** All live, indexable city-service pages. Read at request time, so it changes the moment supply changes. */
export async function cityServiceSitemapEntries(): Promise<SitemapEntry[]> {
  const ctx = anonymousCtx();
  return withDb(ctx, async (tx) => {
    const pairs = await tx
      .select({ citySlug: cities.slug, serviceSlug: services.slug, updatedAt: serviceCities.updatedAt })
      .from(serviceCities)
      .innerJoin(services, eq(services.id, serviceCities.serviceId))
      .innerJoin(cities, eq(cities.id, serviceCities.cityId))
      .where(eq(serviceCities.status, 'live'));
    const out: SitemapEntry[] = [];
    for (const p of pairs) {
      const s = await loadServiceInCity(tx, p.serviceSlug, p.citySlug);
      if (!s) continue;
      const supply = await supplyStatus(tx, ctx, s);
      if (supply.live) out.push({ path: `/${p.citySlug}/${p.serviceSlug}`, lastModified: p.updatedAt });
    }
    return out;
  });
}

export const waitlistInput = z.object({
  citySlug: z.string(),
  serviceSlug: z.string(),
  name: z.string().trim().min(2, 'Enter your name').max(60),
  phone: z.string().min(10, 'Enter your mobile number'),
  need: z.string().trim().min(5, 'Tell us a little about what you need').max(500),
  wantedOn: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
});

export async function joinWaitlist(raw: z.infer<typeof waitlistInput>, ip: string) {
  const input = waitlistInput.parse(raw);
  const phone = normaliseIndianMobile(input.phone);
  await enforceRateLimit(`waitlist:${ip}`, LIMITS.waitlistPerIp);
  return withDb(anonymousCtx(), async (tx) => {
    const s = await loadServiceInCity(tx, input.serviceSlug, input.citySlug);
    if (!s) throw notFound('Service');
    await tx.insert(waitlistEntries).values({
      cityId: s.city.id,
      serviceId: s.service.id,
      name: input.name,
      phoneE164: phone,
      need: input.need,
      wantedOn: input.wantedOn || null,
    });
    return { ok: true };
  });
}

/** Ops view of waitlist demand by city and service (section 17). */
export async function waitlistDemand(ctx: Ctx) {
  requirePermission(ctx, 'waitlist.read');
  return withDb(ctx, (tx) =>
    tx.execute<{ city: string; service: string; entries: number; latest: Date }>(sql`
      select c.name as city, s.name as service, count(*)::int as entries, max(w.created_at) as latest
      from waitlist_entries w join cities c on c.id = w.city_id join services s on s.id = w.service_id
      group by c.name, s.name order by entries desc`),
  );
}
