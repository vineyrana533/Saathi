import { asc, eq } from 'drizzle-orm';
import { cities, zones } from './schema';
import { anonymousCtx, withDb, type Tx } from '@/platform/db/client';

export async function listCities() {
  return withDb(anonymousCtx(), (tx) => tx.select().from(cities).orderBy(asc(cities.name)));
}

export async function getCityBySlug(tx: Tx, slug: string) {
  const [city] = await tx.select().from(cities).where(eq(cities.slug, slug)).limit(1);
  return city ?? null;
}

export async function listZones(tx: Tx, cityId: string) {
  return tx.select().from(zones).where(eq(zones.cityId, cityId)).orderBy(asc(zones.name));
}

export async function listZonesByCitySlug(citySlug: string) {
  return withDb(anonymousCtx(), async (tx) => {
    const city = await getCityBySlug(tx, citySlug);
    return city ? listZones(tx, city.id) : [];
  });
}

export async function listAllZones() {
  return withDb(anonymousCtx(), (tx) =>
    tx
      .select({ id: zones.id, name: zones.name, slug: zones.slug, cityId: cities.id, cityName: cities.name, citySlug: cities.slug })
      .from(zones)
      .innerJoin(cities, eq(cities.id, zones.cityId))
      .orderBy(asc(cities.name), asc(zones.name)),
  );
}
