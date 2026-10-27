/**
 * M1 acceptance: replaying the same payment webhook twice creates one payment, not two.
 * Also: forged signatures are rejected without being stored; a second, different event for an
 * already-captured payment does not capture or post again.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking } from '@/modules/bookings/service';
import { handlePaymentWebhook } from '@/modules/payments/service';
import { sandboxGateway } from '@/platform/adapters/payments';
import { POST as webhookRoute } from '@/app/api/webhooks/payments/[provider]/route';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, ownerSql } from '../helpers/fixtures';

describe('M1 webhook idempotency', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  async function newBooking() {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const c = await createUser();
    return createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 3 }));
  }

  it('processes a replayed webhook once (through the HTTP route)', async () => {
    const b = await newBooking();
    const { rawBody, signature } = sandboxGateway.simulatePayment({ orderId: b.payment.orderId, amountPaise: b.totalPaise, outcome: 'captured' });
    const call = () =>
      webhookRoute(
        new Request('http://test/api/webhooks/payments/sandbox', { method: 'POST', body: rawBody, headers: { 'x-saathi-signature': signature } }),
        { params: Promise.resolve({ provider: 'sandbox' }) },
      );
    const first = await (await call()).json();
    const second = await (await call()).json();
    expect(first).toMatchObject({ status: 'processed', result: 'captured_and_confirmed' });
    expect(second).toMatchObject({ status: 'duplicate' });

    const sql = ownerSql();
    try {
      const pays = await sql`select status from payments where booking_id = ${b.bookingId}`;
      expect(pays).toHaveLength(1);
      expect(pays[0]!.status).toBe('captured');
      const events = await sql`select count(*)::int as n from payment_webhook_events where event_id = ${JSON.parse(rawBody).id}`;
      expect(events[0]!.n).toBe(1);
      const journals = await sql`select count(*)::int as n from journal_entries where booking_id = ${b.bookingId} and kind = 'capture'`;
      expect(journals[0]!.n).toBe(1);
      const [bk] = await sql`select status from bookings where id = ${b.bookingId}`;
      expect(bk!.status).toBe('confirmed');
    } finally {
      await sql.end();
    }
  });

  it('does not capture twice when a different event arrives for the same payment', async () => {
    const b = await newBooking();
    const e1 = sandboxGateway.simulatePayment({ orderId: b.payment.orderId, amountPaise: b.totalPaise, outcome: 'captured' });
    const e2 = sandboxGateway.simulatePayment({ orderId: b.payment.orderId, amountPaise: b.totalPaise, outcome: 'captured' });
    expect(await handlePaymentWebhook('sandbox', e1.rawBody, e1.signature)).toMatchObject({ result: 'captured_and_confirmed' });
    expect(await handlePaymentWebhook('sandbox', e2.rawBody, e2.signature)).toMatchObject({ result: 'already_captured' });
    const sql = ownerSql();
    try {
      const journals = await sql`select count(*)::int as n from journal_entries where booking_id = ${b.bookingId}`;
      expect(journals[0]!.n).toBe(1);
    } finally {
      await sql.end();
    }
  });

  it('rejects a forged signature and stores nothing', async () => {
    const b = await newBooking();
    const { rawBody } = sandboxGateway.simulatePayment({ orderId: b.payment.orderId, amountPaise: b.totalPaise, outcome: 'captured' });
    const forged = 'a'.repeat(64);
    expect(await handlePaymentWebhook('sandbox', rawBody, forged)).toEqual({ status: 'rejected', reason: 'bad_signature' });
    const sql = ownerSql();
    try {
      const events = await sql`select count(*)::int as n from payment_webhook_events where event_id = ${JSON.parse(rawBody).id}`;
      expect(events[0]!.n).toBe(0);
      const [p] = await sql`select status from payments where booking_id = ${b.bookingId}`;
      expect(p!.status).toBe('created');
    } finally {
      await sql.end();
    }
  });

  it('ignores a captured event whose amount does not match the order', async () => {
    const b = await newBooking();
    const { rawBody, signature } = sandboxGateway.simulatePayment({ orderId: b.payment.orderId, amountPaise: b.totalPaise - 100, outcome: 'captured' });
    expect(await handlePaymentWebhook('sandbox', rawBody, signature)).toMatchObject({ result: 'amount_mismatch' });
  });
});
