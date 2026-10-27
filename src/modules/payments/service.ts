import { and, desc, eq, sql } from 'drizzle-orm';
import { paymentWebhookEvents, payments } from './schema';
import { postJournal, workerEarnings } from './ledger';
import { workerProfiles } from '../workers/schema';
import { requirePermission } from '@/platform/auth/permissions';
import { bookings } from '../bookings/schema';
import { confirmBookingAfterCapture } from '../bookings/service';
import { gatewayByProvider, sandboxGateway, webhookEventSchema } from '@/platform/adapters/payments';
import { systemCtx, withDb, type Ctx } from '@/platform/db/client';
import { audit } from '@/platform/audit';
import { AppError, conflict, notFound, unauthenticated } from '@/platform/errors';
import { log } from '@/platform/logger';

export type WebhookOutcome =
  | { status: 'rejected'; reason: 'bad_signature' | 'unknown_provider' | 'bad_payload' }
  | { status: 'duplicate' }
  | { status: 'processed'; result: string };

/**
 * Webhook entry point (HTTP route and sandbox checkout both call this).
 * - Signature verified before anything is stored, so forged events cannot squat on event ids.
 * - (provider, event_id) is unique: a replay is acknowledged and changes nothing.
 * - payments.provider_payment_id is unique and the capture journal has an idempotency key,
 *   so even a different event for the same payment cannot capture twice.
 */
export async function handlePaymentWebhook(provider: string, rawBody: string, signature: string | null): Promise<WebhookOutcome> {
  const gateway = gatewayByProvider(provider);
  if (!gateway) return { status: 'rejected', reason: 'unknown_provider' };
  if (!gateway.verifySignature(rawBody, signature)) {
    log.warn('payment webhook rejected: bad signature', { provider });
    return { status: 'rejected', reason: 'bad_signature' };
  }
  let event;
  try {
    event = webhookEventSchema.parse(JSON.parse(rawBody));
  } catch {
    return { status: 'rejected', reason: 'bad_payload' };
  }

  const ctx = systemCtx();
  return withDb(ctx, async (tx) => {
    const [stored] = await tx
      .insert(paymentWebhookEvents)
      .values({ provider, eventId: event.id, eventType: event.type, signatureValid: true, payload: event as unknown as Record<string, unknown> })
      .onConflictDoNothing()
      .returning({ id: paymentWebhookEvents.id });
    if (!stored) return { status: 'duplicate' as const };

    const finish = async (result: string) => {
      await tx.update(paymentWebhookEvents).set({ processedAt: sql`now()`, result }).where(eq(paymentWebhookEvents.id, stored.id));
      return { status: 'processed' as const, result };
    };

    const [payment] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.provider, provider), eq(payments.providerOrderId, event.data.orderId)))
      .limit(1)
      .for('update');
    if (!payment) return finish('unknown_order');
    if (event.data.amountPaise !== payment.amountPaise) {
      await audit(tx, ctx, 'payment.amount_mismatch', 'payment', payment.id, { expected: payment.amountPaise, got: event.data.amountPaise });
      return finish('amount_mismatch');
    }

    if (event.type === 'payment.failed') {
      if (payment.status === 'created') await tx.update(payments).set({ status: 'failed' }).where(eq(payments.id, payment.id));
      return finish('marked_failed');
    }

    // payment.captured
    if (payment.status === 'captured') return finish('already_captured');
    await tx
      .update(payments)
      .set({ status: 'captured', providerPaymentId: event.data.paymentId, capturedAt: sql`now()` })
      .where(eq(payments.id, payment.id));
    await postJournal(tx, {
      kind: 'capture',
      bookingId: payment.bookingId,
      paymentId: payment.id,
      memo: `Payment ${event.data.paymentId} captured`,
      idempotencyKey: `capture:${payment.id}`,
      createdBy: 'system',
      lines: [
        { account: 'gateway_clearing', debitPaise: payment.amountPaise, lineCode: 'gateway_receipt' },
        { account: 'customer_funds_held', creditPaise: payment.amountPaise, lineCode: 'held_for_booking' },
      ],
    });
    const confirmation = await confirmBookingAfterCapture(tx, payment.bookingId);
    await audit(tx, ctx, 'payment.captured', 'payment', payment.id, { bookingId: payment.bookingId, confirmed: confirmation.confirmed });
    if (!confirmation.confirmed) {
      // Paid after the hold expired or after cancellation: money is held and must be refunded (Milestone 3 flow).
      await audit(tx, ctx, 'payment.captured_needs_refund', 'payment', payment.id, { bookingStatus: confirmation.status });
      return finish('captured_needs_refund');
    }
    return finish('captured_and_confirmed');
  });
}

/**
 * Sandbox checkout: the customer presses "Pay" on our clearly labelled sandbox page.
 * We ask the sandbox gateway for the webhook it would send and process it through the real path.
 */
export async function payWithSandbox(ctx: Ctx, bookingId: string, outcome: 'captured' | 'failed' = 'captured') {
  if (!ctx.userId) throw unauthenticated();
  const payment = await withDb(ctx, async (tx) => {
    const [row] = await tx
      .select({ payment: payments, bookingStatus: bookings.status, customer: bookings.customerUserId })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(eq(payments.bookingId, bookingId))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (!row || row.customer !== ctx.userId) throw notFound('Booking');
    if (row.payment.provider !== 'sandbox') throw new AppError('not_sandbox', 'This payment is not in sandbox mode', 400);
    if (row.bookingStatus !== 'pending_payment') throw conflict('not_payable', 'This booking is not waiting for payment');
    return row.payment;
  });
  const { rawBody, signature } = sandboxGateway.simulatePayment({
    orderId: payment.providerOrderId,
    amountPaise: payment.amountPaise,
    outcome,
  });
  return handlePaymentWebhook('sandbox', rawBody, signature);
}

/** A worker's own earnings, read from their worker_payable ledger account (RLS limits it to them). */
export async function getMyEarnings(ctx: Ctx) {
  requirePermission(ctx, 'ledger.read');
  return withDb(ctx, async (tx) => {
    const [wp] = await tx.select({ id: workerProfiles.id }).from(workerProfiles).where(eq(workerProfiles.userId, ctx.userId!)).limit(1);
    if (!wp) return { total: 0, rows: [] };
    return workerEarnings(tx, wp.id);
  });
}
