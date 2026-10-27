import { beforeAll, describe, expect, it } from 'vitest';
import { cancelBooking, createBooking, finishJob, getBookingForViewer, startJob } from '@/modules/bookings/service';
import { handlePaymentWebhook, payWithSandbox } from '@/modules/payments/service';
import { sandboxGateway } from '@/platform/adapters/payments';
import { rateBooking } from '@/modules/reviews/service';
import { expirePaymentHolds } from '@/modules/jobs/service';
import { bookingLedgerSummary } from '@/modules/payments/ledger';
import { systemCtx, withDb } from '@/platform/db/client';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, ownerSql } from '../helpers/fixtures';

describe('booking lifecycle beyond the happy path', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  async function completedBooking() {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const c = await createUser();
    const b = await createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 2 }));
    await payWithSandbox(c.ctx, b.bookingId);
    const sql = ownerSql();
    await sql`update bookings set starts_at = now() + interval '5 minutes' where id = ${b.bookingId}`;
    await sql.end();
    await startJob(w.ctx, b.bookingId, (await getBookingForViewer(c.ctx, b.bookingId)).codes.start!);
    await finishJob(w.ctx, b.bookingId, (await getBookingForViewer(c.ctx, b.bookingId)).codes.end!);
    return { w, c, b };
  }

  it('ratings: only after completion, once per direction, both ways, low scores flagged, average updated', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const c = await createUser();
    const pending = await createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 9 }));
    await expect(rateBooking(c.ctx, pending.bookingId, { score: 5 })).rejects.toMatchObject({ code: 'not_completed' });

    const done = await completedBooking();
    await rateBooking(done.c.ctx, done.b.bookingId, { score: 2, comment: 'Late by 30 minutes' });
    await expect(rateBooking(done.c.ctx, done.b.bookingId, { score: 5 })).rejects.toMatchObject({ code: 'already_rated' });
    await rateBooking(done.w.ctx, done.b.bookingId, { score: 5 });
    const outsider = await createUser();
    await expect(rateBooking(outsider.ctx, done.b.bookingId, { score: 1 })).rejects.toMatchObject({ code: 'not_found' });

    const sql = ownerSql();
    try {
      const [wp] = await sql`select rating_count, rating_avg_x100 from worker_profiles where id = ${done.w.worker.id}`;
      expect(wp).toMatchObject({ rating_count: 1, rating_avg_x100: 200 });
      const flags = await sql`select reasons from moderation_flags where entity_type = 'rating' and user_id = ${done.c.user.id}`;
      expect(flags[0]!.reasons).toContain('low_rating');
    } finally {
      await sql.end();
    }
  });

  it('cancellation: free over 24 hours, 50% inside 24 hours, with a balanced journal and the slot released', async () => {
    for (const [days, expectedFee] of [[3, 0], [0.5, driverTotal() / 2]] as const) {
      const w = await createDriver({ zoneIds: [t.zone.id] });
      const c = await createUser();
      const b = await createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 3 }));
      await payWithSandbox(c.ctx, b.bookingId);
      if (days < 1) {
        const sql = ownerSql();
        await sql`update bookings set starts_at = now() + interval '12 hours' where id = ${b.bookingId}`;
        await sql.end();
      }
      const out = await cancelBooking(c.ctx, { bookingId: b.bookingId, reason: 'Plans changed' });
      expect(out.feePaise).toBe(expectedFee);
      const ledger = await withDb(systemCtx(), (tx) => bookingLedgerSummary(tx, b.bookingId));
      const cancel = ledger.filter((l) => l.kind === 'cancellation');
      expect(cancel.reduce((s, l) => s + Number(l.debit), 0)).toBe(cancel.reduce((s, l) => s + Number(l.credit), 0));
      expect(Number(cancel.find((l) => l.code === 'refunds_payable')?.credit ?? 0)).toBe(driverTotal() - expectedFee);
      // The worker is free again for the same slot.
      const again = await createUser();
      await expect(
        createBooking(again.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 3 })),
      ).resolves.toMatchObject({ ref: expect.stringMatching(/^SA-/) });
    }
  });

  it('cannot cancel someone else\'s booking or a completed one', async () => {
    const done = await completedBooking();
    await expect(cancelBooking(done.c.ctx, { bookingId: done.b.bookingId, reason: 'x' })).rejects.toMatchObject({ code: 'cannot_cancel' });
    const outsider = await createUser();
    await expect(cancelBooking(outsider.ctx, { bookingId: done.b.bookingId, reason: 'x' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('an unpaid hold expires, releases the worker, and a late payment is flagged for refund', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const c = await createUser();
    const b = await createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 4 }));
    const sql = ownerSql();
    try {
      await sql`update bookings set hold_expires_at = now() - interval '1 minute' where id = ${b.bookingId}`;
      // Booking the same slot works even before the sweep: stale holds are cleared in the booking transaction.
      const other = await createUser();
      await createBooking(other.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 4 }));
      const [row] = await sql`select status from bookings where id = ${b.bookingId}`;
      expect(row!.status).toBe('expired');
      expect(await expirePaymentHolds()).toBe(0);
      await expect(payWithSandbox(c.ctx, b.bookingId)).rejects.toMatchObject({ code: 'not_payable' });
      // If the gateway still captures (customer paid just as the hold lapsed), the money is held and flagged.
      const late = sandboxGateway.simulatePayment({ orderId: b.payment.orderId, amountPaise: b.totalPaise, outcome: 'captured' });
      expect(await handlePaymentWebhook('sandbox', late.rawBody, late.signature)).toMatchObject({ result: 'captured_needs_refund' });
      const [after] = await sql`select status from bookings where id = ${b.bookingId}`;
      expect(after!.status).toBe('expired');
      const flagged = await sql`select count(*)::int as n from audit_log where action = 'payment.captured_needs_refund' and data->>'bookingStatus' = 'expired'`;
      expect(flagged[0]!.n).toBeGreaterThanOrEqual(1);
    } finally {
      await sql.end();
    }
  });
});
