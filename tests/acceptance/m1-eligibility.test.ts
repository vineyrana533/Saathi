/**
 * M1 acceptance: a customer cannot book a worker who is unverified, not approved for the category,
 * outside the service area, or already booked for an overlapping slot.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking, searchAvailableWorkers } from '@/modules/bookings/service';
import { payWithSandbox } from '@/modules/payments/service';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, DRIVER_ANSWERS, slot } from '../helpers/fixtures';

describe('M1 eligibility', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  async function expectCannotBook(workerId: string, zoneId: string) {
    const { ctx } = await createUser();
    await expect(
      createBooking(ctx, bookingRequest({ citySlug: t.city.slug, zoneId, workerId, expectedTotalPaise: driverTotal() })),
    ).rejects.toMatchObject({ code: 'worker_unavailable' });
  }

  async function searchIds(zoneId: string, days = 2) {
    const { ctx } = await createUser();
    const res = await searchAvailableWorkers(ctx, {
      serviceSlug: 'personal-driver', citySlug: t.city.slug, zoneId, ...slot(days), durationMinutes: 240, answers: DRIVER_ANSWERS,
    });
    return res.workers.map((w) => w.id);
  }

  it('shows and books a fully verified, approved, available worker', async () => {
    const good = await createDriver({ zoneIds: [t.zone.id] });
    expect(await searchIds(t.zone.id)).toContain(good.worker.id);
    const { ctx } = await createUser();
    const out = await createBooking(ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: good.worker.id, expectedTotalPaise: driverTotal(), days: 3 }));
    expect(out.ref).toMatch(/^SA-/);
  });

  it('rejects an unverified worker (applicant status)', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id], status: 'applicant' });
    expect(await searchIds(t.zone.id)).not.toContain(w.worker.id);
    await expectCannotBook(w.worker.id, t.zone.id);
  });

  it('rejects a worker not approved for this category', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id], approved: false });
    expect(await searchIds(t.zone.id)).not.toContain(w.worker.id);
    await expectCannotBook(w.worker.id, t.zone.id);
  });

  it('rejects a worker outside the service area', async () => {
    const w = await createDriver({ zoneIds: [t.zoneB.id] });
    expect(await searchIds(t.zone.id)).not.toContain(w.worker.id);
    await expectCannotBook(w.worker.id, t.zone.id);
  });

  it('rejects a worker whose licence does not cover the vehicle class', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id], vehicleClasses: ['MCWG'] });
    expect(await searchIds(t.zone.id)).not.toContain(w.worker.id);
    await expectCannotBook(w.worker.id, t.zone.id);
  });

  it('rejects a worker already booked for an overlapping slot, and hides them in search', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const first = await createUser();
    const booked = await createBooking(first.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 4, time: '10:00' }));
    await payWithSandbox(first.ctx, booked.bookingId);

    // Overlapping (12:00-16:00 against 10:00-14:00).
    const second = await createUser();
    await expect(
      createBooking(second.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 4, time: '12:00' })),
    ).rejects.toMatchObject({ code: 'worker_unavailable' });
    expect(await searchIds(t.zone.id, 4)).not.toContain(w.worker.id);

    // Back-to-back (14:00-18:00) leaves no time to travel (60-minute gap, decisions.md T-46);
    // 15:00-19:00 is allowed.
    const third = await createUser();
    await expect(
      createBooking(third.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 4, time: '14:00' })),
    ).rejects.toMatchObject({ code: 'worker_unavailable' });
    const ok = await createBooking(third.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 4, time: '15:00' }));
    expect(ok.bookingId).toBeTruthy();
  });

  it('requires the code of conduct before the first booking', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const { ctx } = await createUser(['customer'], { conduct: false });
    await expect(
      createBooking(ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 5 })),
    ).rejects.toMatchObject({ code: 'conduct_required' });
  });
});
