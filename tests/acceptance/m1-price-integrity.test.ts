/**
 * M1 acceptance: the price shown before payment equals the price snapshot stored on the booking,
 * which equals the ledger entries.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking, finishJob, getBookingForViewer, searchAvailableWorkers, startJob } from '@/modules/bookings/service';
import { payWithSandbox } from '@/modules/payments/service';
import { bookingLedgerSummary } from '@/modules/payments/ledger';
import { systemCtx, withDb } from '@/platform/db/client';
import { bookingRequest, createDriver, createTestCity, createUser, DRIVER_ANSWERS, ownerSql, slot } from '../helpers/fixtures';

describe('M1 price integrity', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  it('shown price = stored snapshot = capture journal = completion journal', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const customer = await createUser();
    const s = slot(3, '08:00');

    // 1. What the customer is shown before paying.
    const search = await searchAvailableWorkers(customer.ctx, {
      serviceSlug: 'personal-driver', citySlug: t.city.slug, zoneId: t.zone.id, ...s, durationMinutes: 420, answers: DRIVER_ANSWERS,
    });
    const shown = search.quote!;
    expect(shown.customer.totalPaise).toBe(175000); // 7 h at the ₹250/h staging placeholder
    expect(shown.customer.lines.reduce((a, l) => a + l.amountPaise, 0)).toBe(shown.customer.totalPaise);

    // 2. Booking stores the same snapshot.
    const created = await createBooking(customer.ctx, {
      ...bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: shown.customer.totalPaise, days: 3, time: '08:00', durationMinutes: 420 }),
    });
    expect(created.totalPaise).toBe(shown.customer.totalPaise);
    const sql = ownerSql();
    try {
      const [row] = await sql`select price_snapshot, total_paise from bookings where id = ${created.bookingId}`;
      expect(row!.price_snapshot.customer).toEqual(shown.customer);
      expect(row!.price_snapshot.allocations).toEqual(shown.allocations);
      expect(Number(row!.total_paise)).toBe(shown.customer.totalPaise);

      // 3. Payment and capture journal equal the shown total.
      const pay = await payWithSandbox(customer.ctx, created.bookingId);
      expect(pay).toMatchObject({ status: 'processed', result: 'captured_and_confirmed' });

      // 4. Complete the job, then compare every ledger line with the snapshot.
      const view = await getBookingForViewer(customer.ctx, created.bookingId);
      await sql`update bookings set starts_at = now() + interval '10 minutes' where id = ${created.bookingId}`;
      await startJob(w.ctx, created.bookingId, view.codes.start!);
      const view2 = await getBookingForViewer(customer.ctx, created.bookingId);
      await finishJob(w.ctx, created.bookingId, view2.codes.end!);
    } finally {
      await sql.end();
    }

    const ledger = await withDb(systemCtx(), (tx) => bookingLedgerSummary(tx, created.bookingId));
    const line = (kind: string, code: string) => ledger.find((l) => l.kind === kind && l.code === code);
    expect(Number(line('capture', 'gateway_clearing')!.debit)).toBe(shown.customer.totalPaise);
    expect(Number(line('capture', 'customer_funds_held')!.credit)).toBe(shown.customer.totalPaise);
    expect(Number(line('completion', 'customer_funds_held')!.debit)).toBe(shown.customer.totalPaise);
    for (const a of shown.allocations) {
      expect(Number(line('completion', a.account)!.credit)).toBe(a.amountPaise);
    }
    expect(Number(line('completion', 'worker_payable')!.credit)).toBe(shown.worker.netPaise);
    // Every journal balances.
    for (const kind of ['capture', 'completion']) {
      const rows = ledger.filter((l) => l.kind === kind);
      expect(rows.reduce((a, r) => a + Number(r.debit), 0)).toBe(rows.reduce((a, r) => a + Number(r.credit), 0));
    }
  });

  it('rejects a booking when the client saw a different total', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const customer = await createUser();
    await expect(
      createBooking(customer.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: 1, days: 4 })),
    ).rejects.toMatchObject({ code: 'price_changed' });
  });
});
