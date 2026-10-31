/**
 * Distance matching (decisions.md T-45 to T-47): people are offered only within their own travel
 * distance and the service's limit, nearest first, with a travel gap between jobs, and work is
 * shared between people at the same distance.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createBooking, searchAvailableWorkers } from '@/modules/bookings/service';
import { payWithSandbox } from '@/modules/payments/service';
import { saveWorkerProfile } from '@/modules/workers/service';
import { localities } from '@/modules/geo/schema';
import { workerProfiles } from '@/modules/workers/schema';
import { systemCtx, withDb } from '@/platform/db/client';
import { createDriver, createTestCity, createUser, DRIVER_ANSWERS, driverTotal, ownerSql, slot } from '../helpers/fixtures';

/** A point `km` north of `p` (1 degree of latitude is about 111.2 km). */
const north = (p: { lat: number; lng: number }, km: number) => ({ lat: p.lat + km / 111.2, lng: p.lng });

/**
 * A test city with two localities 22 km apart, placed at a random spot in India so drivers from
 * other test files never fall within reach.
 */
async function cityWithLocalities() {
  const t = await createTestCity({ threshold: 1 });
  const centre = { lat: 20 + Math.random() * 4, lng: 76 + Math.random() * 8 };
  const far = north(centre, 22);
  const [locCentre, locFar] = await withDb(systemCtx(), async (tx) =>
    tx.insert(localities).values([
      { cityId: t.city.id, zoneId: t.zone.id, slug: 'centre', name: 'Centre', ...centre },
      { cityId: t.city.id, zoneId: t.zoneB.id, slug: 'far', name: 'Far', ...far },
    ]).returning(),
  );
  return { ...t, centre, far, locCentre: locCentre!, locFar: locFar! };
}

async function search(t: Awaited<ReturnType<typeof cityWithLocalities>>, where: { localityId?: string; lat?: number; lng?: number }, days = 3, time = '10:00') {
  const { ctx } = await createUser(['customer']);
  return searchAvailableWorkers(ctx, { serviceSlug: 'personal-driver', citySlug: t.city.slug, ...where, ...slot(days, time), durationMinutes: 240, answers: DRIVER_ANSWERS });
}

describe('distance matching', () => {
  it('lists people within reach, nearest first, with their distance', async () => {
    const t = await cityWithLocalities();
    const atCentre = await createDriver({ zoneIds: [t.zone.id], base: { ...t.centre, radiusKm: 10 } });
    const fourKm = await createDriver({ zoneIds: [t.zone.id], base: { ...north(t.centre, 4), radiusKm: 10 } });
    const tooFar = await createDriver({ zoneIds: [t.zone.id], base: { ...t.far, radiusKm: 10 } });
    const travelsFar = await createDriver({ zoneIds: [t.zoneB.id], base: { ...t.far, radiusKm: 30 } });
    const noBase = await createDriver({ zoneIds: [t.zone.id] });

    const res = await search(t, { localityId: t.locCentre.id });
    expect(res.location).toMatchObject({ localityName: 'Centre', zoneId: t.zone.id, fromDevice: false });
    const ids = res.workers.map((w) => w.id);
    // Zone no longer limits people with a home base; distance does. Without a base, the zone still counts.
    expect(ids).toEqual([atCentre.worker.id, fourKm.worker.id, noBase.worker.id, travelsFar.worker.id]);
    expect(ids).not.toContain(tooFar.worker.id);
    const km = Object.fromEntries(res.workers.map((w) => [w.id, w.distanceKm]));
    expect(km[atCentre.worker.id]).toBe(0);
    expect(km[fourKm.worker.id]).toBeCloseTo(4, 0);
    expect(km[noBase.worker.id]).toBeNull();
    expect(km[travelsFar.worker.id]).toBeCloseTo(22, 0);

    // A phone location near the far locality finds the person who lives there.
    const there = await search(t, { lat: t.far.lat + 0.001, lng: t.far.lng });
    expect(there.location).toMatchObject({ localityName: 'Far', zoneId: t.zoneB.id, fromDevice: true });
    // Both people who live there come first (same distance, so their order is a tie).
    expect(there.workers.slice(0, 2).map((w) => w.id).sort()).toEqual([tooFar.worker.id, travelsFar.worker.id].sort());
  });

  it("never sends anyone beyond the service's own travel limit", async () => {
    const t = await cityWithLocalities();
    // Willing to travel 50 km, but personal drivers are limited to 40 km.
    const keen = await createDriver({ zoneIds: [t.zone.id], base: { ...north(t.centre, 45), radiusKm: 50 } });
    const res = await search(t, { localityId: t.locCentre.id });
    expect(res.workers.map((w) => w.id)).not.toContain(keen.worker.id);
  });

  it('keeps a travel gap between one person’s jobs and stores where each job is', async () => {
    const t = await cityWithLocalities();
    const d = await createDriver({ zoneIds: [t.zone.id], base: { ...t.centre, radiusKm: 10 } });
    const { ctx } = await createUser(['customer']);
    const booked = await createBooking(ctx, {
      serviceSlug: 'personal-driver', citySlug: t.city.slug, localityId: t.locCentre.id, ...slot(4, '10:00'), durationMinutes: 240,
      answers: DRIVER_ANSWERS, workerId: d.worker.id, addressLine: 'House 3, Centre Road', expectedTotalPaise: driverTotal(),
    });
    await payWithSandbox(ctx, booked.bookingId);

    expect((await search(t, { localityId: t.locCentre.id }, 4, '14:30')).workers.map((w) => w.id)).not.toContain(d.worker.id);
    expect((await search(t, { localityId: t.locCentre.id }, 4, '15:00')).workers.map((w) => w.id)).toContain(d.worker.id);

    const sql = ownerSql();
    try {
      const [row] = await sql`select locality_id, zone_id, job_lat, job_lng from bookings where id = ${booked.bookingId}`;
      expect(row).toMatchObject({ locality_id: t.locCentre.id, zone_id: t.zone.id, job_lat: t.centre.lat, job_lng: t.centre.lng });
    } finally {
      await sql.end();
    }
  });

  it('shares work: at the same distance, the person with fewer recent jobs comes first', async () => {
    const t = await cityWithLocalities();
    const home = { ...north(t.centre, 1), radiusKm: 10 };
    const busy = await createDriver({ zoneIds: [t.zone.id], base: home });
    const quiet = await createDriver({ zoneIds: [t.zone.id], base: home });
    for (const days of [2, 3]) {
      const { ctx } = await createUser(['customer']);
      const b = await createBooking(ctx, {
        serviceSlug: 'personal-driver', citySlug: t.city.slug, localityId: t.locCentre.id, ...slot(days, '10:00'), durationMinutes: 240,
        answers: DRIVER_ANSWERS, workerId: busy.worker.id, addressLine: 'House 9, Centre Road', expectedTotalPaise: driverTotal(),
      });
      await payWithSandbox(ctx, b.bookingId);
    }
    const ids = (await search(t, { localityId: t.locCentre.id }, 5)).workers.map((w) => w.id);
    expect(ids.indexOf(quiet.worker.id)).toBeLessThan(ids.indexOf(busy.worker.id));
  });

  it('refuses a phone location outside the city', async () => {
    const t = await cityWithLocalities();
    await createDriver({ zoneIds: [t.zone.id], base: { ...t.centre } }); // so the service is live and the location gets checked
    await expect(search(t, { lat: t.centre.lat + 1, lng: t.centre.lng })).rejects.toMatchObject({ code: 'location_outside_city' });
  });

  it('stores a worker home base to about a kilometre, tied to the nearest locality', async () => {
    const t = await cityWithLocalities();
    const { user } = await createUser(['customer']);
    await saveWorkerProfile({ userId: user.id, roles: ['customer'], requestId: 'r' }, {
      displayName: 'Ravi', bio: '', languages: ['Hindi'], gender: 'male', yearsExperience: 6, homeCitySlug: 'delhi', zoneIds: [t.zone.id],
      customerGenderPreference: 'any', baseLat: t.centre.lat + 0.01234, baseLng: t.centre.lng - 0.00456, travelRadiusKm: 15,
    });
    const [wp] = await withDb(systemCtx(), (tx) => tx.select().from(workerProfiles).where(eq(workerProfiles.userId, user.id)));
    expect(wp!.baseLocalityId).toBe(t.locCentre.id);
    expect(wp!.baseLat).toBe(Math.round((t.centre.lat + 0.01234) * 100) / 100);
    expect(wp!.baseLng).toBe(Math.round((t.centre.lng - 0.00456) * 100) / 100);
    expect(wp!.travelRadiusKm).toBe(15);
  });
});
