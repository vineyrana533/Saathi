import { and, asc, eq } from 'drizzle-orm';
import { cities, localities, zones } from './schema';
import { nearest, roundCoord } from './distance';
import { anonymousCtx, withDb, type Tx } from '@/platform/db/client';
import { invalid } from '@/platform/errors';

/** A job further than this from every locality of its city is outside the city. */
const MAX_KM_FROM_CITY = 30;

export interface JobLocationInput {
  zoneId?: string;
  localityId?: string;
  lat?: number;
  lng?: number;
}

export interface JobLocation {
  zoneId: string;
  zoneName: string;
  localityId: string | null;
  localityName: string | null;
  /** Null only when the caller gave a zone alone (older API clients): matching then falls back to zones. */
  lat: number | null;
  lng: number | null;
  fromDevice: boolean;
}

/**
 * Works out where a job is. A phone location wins (rounded to about 100 m) and is tied to the
 * nearest locality of the city; otherwise the chosen locality's centre; otherwise just the zone.
 */
export async function resolveJobLocation(tx: Tx, cityId: string, input: JobLocationInput): Promise<JobLocation> {
  const rows = await tx
    .select({ id: localities.id, name: localities.name, lat: localities.lat, lng: localities.lng, zoneId: zones.id, zoneName: zones.name })
    .from(localities)
    .innerJoin(zones, eq(zones.id, localities.zoneId))
    .where(eq(localities.cityId, cityId));

  if (input.lat != null && input.lng != null) {
    const point = { lat: roundCoord(input.lat, 3), lng: roundCoord(input.lng, 3) };
    const near = nearest(point, rows);
    if (!near || near.km > MAX_KM_FROM_CITY) {
      throw invalid('location_outside_city', 'That location is outside this city. Pick an area from the list instead.', { field: 'loc' });
    }
    return { zoneId: near.item.zoneId, zoneName: near.item.zoneName, localityId: near.item.id, localityName: near.item.name, ...point, fromDevice: true };
  }
  if (input.localityId) {
    const l = rows.find((r) => r.id === input.localityId);
    if (!l) throw invalid('invalid_locality', 'Pick an area in this city', { field: 'loc' });
    return { zoneId: l.zoneId, zoneName: l.zoneName, localityId: l.id, localityName: l.name, lat: l.lat, lng: l.lng, fromDevice: false };
  }
  if (input.zoneId) {
    const [z] = await tx.select({ id: zones.id, name: zones.name }).from(zones).where(and(eq(zones.id, input.zoneId), eq(zones.cityId, cityId))).limit(1);
    if (!z) throw invalid('invalid_zone', 'Pick an area in this city', { field: 'zoneId' });
    return { zoneId: z.id, zoneName: z.name, localityId: null, localityName: null, lat: null, lng: null, fromDevice: false };
  }
  throw invalid('location_required', 'Pick an area', { field: 'loc' });
}

/**
 * A worker's home base: the phone location rounded to about 1 km (never shown to anyone), tied to
 * the nearest locality in any city, or the chosen locality's centre.
 */
export async function resolveHomeBase(tx: Tx, input: { localityId?: string; lat?: number; lng?: number }) {
  const rows = await tx.select({ id: localities.id, lat: localities.lat, lng: localities.lng }).from(localities);
  if (input.lat != null && input.lng != null) {
    const point = { lat: roundCoord(input.lat, 2), lng: roundCoord(input.lng, 2) };
    const near = nearest(point, rows);
    if (!near || near.km > MAX_KM_FROM_CITY) {
      throw invalid('location_outside_city', 'That location is outside the cities Saathi works in. Pick an area from the list instead.', { field: 'baseLocalityId' });
    }
    return { baseLocalityId: near.item.id, baseLat: point.lat, baseLng: point.lng };
  }
  if (input.localityId) {
    const l = rows.find((r) => r.id === input.localityId);
    if (!l) throw invalid('invalid_locality', 'Pick your home area', { field: 'baseLocalityId' });
    return { baseLocalityId: l.id, baseLat: l.lat, baseLng: l.lng };
  }
  return { baseLocalityId: null, baseLat: null, baseLng: null };
}

export interface LocalityOption {
  id: string;
  name: string;
  group: string;
  lat: number;
  lng: number;
}

/** Localities for a picker, grouped by zone (or "City: zone" when several cities are listed). */
export async function listLocalityOptions(citySlug?: string): Promise<LocalityOption[]> {
  return withDb(anonymousCtx(), async (tx) => {
    const rows = await tx
      .select({ id: localities.id, name: localities.name, lat: localities.lat, lng: localities.lng, zoneName: zones.name, cityName: cities.name })
      .from(localities)
      .innerJoin(zones, eq(zones.id, localities.zoneId))
      .innerJoin(cities, eq(cities.id, localities.cityId))
      .where(citySlug ? eq(cities.slug, citySlug) : undefined)
      .orderBy(asc(cities.name), asc(zones.name), asc(localities.name));
    return rows.map((r) => ({ id: r.id, name: r.name, group: citySlug ? r.zoneName : `${r.cityName}: ${r.zoneName}`, lat: r.lat, lng: r.lng }));
  });
}
