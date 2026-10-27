/**
 * M1 acceptance: changing the service price after booking does not change the confirmed booking.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking, finishJob, getBookingForViewer, searchAvailableWorkers, startJob } from '@/modules/bookings/service';
import { payWithSandbox } from '@/modules/payments/service';
import { updateServiceCityPricing } from '@/modules/catalog/service';
import { bookingLedgerSummary } from '@/modules/payments/ledger';
import { DRIVER_PRICING } from '@/modules/catalog/seed';
import { systemCtx, withDb } from '@/platform/db/client';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, DRIVER_ANSWERS, ownerSql, slot, staffCtx } from '../helpers/fixtures';

describe('M1 price snapshot', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  it('keeps the confirmed booking, its snapshot and its ledger at the old price', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const customer = await createUser();
    const oldTotal = driverTotal(240);
    const booked = await createBooking(customer.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: oldTotal, days: 3 }));
    await payWithSandbox(customer.ctx, booked.bookingId);

    // Admin doubles the hourly rate.
    const admin = await staffCtx(['admin']);
    const updated = await updateServiceCityPricing(admin, { serviceCityId: t.serviceCity.id, pricing: { ...DRIVER_PRICING, hourlyRatePaise: 50000 } });
    expect(updated.pricingVersion).toBe(2);

    // New quotes use the new price.
    const quote = await searchAvailableWorkers(customer.ctx, {
      serviceSlug: 'personal-driver', citySlug: t.city.slug, zoneId: t.zone.id, ...slot(5), durationMinutes: 240, answers: DRIVER_ANSWERS,
    });
    expect(quote.quote!.customer.totalPaise).toBe(200000);

    // The confirmed booking is unchanged.
    const view = await getBookingForViewer(customer.ctx, booked.bookingId);
    expect(view.status).toBe('confirmed');
    expect(view.totalPaise).toBe(oldTotal);
    expect(view.price!.totalPaise).toBe(oldTotal);

    // A client still holding the old quote cannot create a new booking at the old price.
    const late = await createUser();
    await expect(
      createBooking(late.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: oldTotal, days: 6 })),
    ).rejects.toMatchObject({ code: 'price_changed' });

    // Completing the old booking posts the old amounts.
    const sql = ownerSql();
    try {
      await sql`update bookings set starts_at = now() + interval '5 minutes' where id = ${booked.bookingId}`;
      await startJob(w.ctx, booked.bookingId, view.codes.start!);
      const v2 = await getBookingForViewer(customer.ctx, booked.bookingId);
      await finishJob(w.ctx, booked.bookingId, v2.codes.end!);
      const [row] = await sql`select pricing_version, (price_snapshot->>'pricingVersion')::int as snap_version from bookings where id = ${booked.bookingId}`;
      expect(row!.pricing_version).toBe(1);
      expect(row!.snap_version).toBe(1);
    } finally {
      await sql.end();
    }
    const ledger = await withDb(systemCtx(), (tx) => bookingLedgerSummary(tx, booked.bookingId));
    const held = ledger.find((l) => l.kind === 'completion' && l.code === 'customer_funds_held');
    expect(Number(held!.debit)).toBe(oldTotal);
  });
});
