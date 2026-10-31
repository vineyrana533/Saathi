/**
 * Straight-line distance on the earth's surface (haversine). Pure, so the browser location picker
 * and the server share it; the eligibility query uses the same formula in SQL.
 */
export interface Point {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearest<T extends Point>(from: Point, candidates: T[]): { item: T; km: number } | null {
  let best: { item: T; km: number } | null = null;
  for (const c of candidates) {
    const km = distanceKm(from, c);
    if (!best || km < best.km) best = { item: c, km };
  }
  return best;
}

/** Rounds a coordinate: 3 decimals is about 100 m (job locations), 2 is about 1 km (worker homes). */
export const roundCoord = (v: number, decimals: 2 | 3) => Math.round(v * 10 ** decimals) / 10 ** decimals;
