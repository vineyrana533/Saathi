import { and, eq } from 'drizzle-orm';
import { quotes, serviceRequestEvents, serviceRequests } from './schema';
import type { Tx } from '@/platform/db/client';

/**
 * Called inside payment confirmation (system scope). If the booking came from a quote, that quote
 * becomes accepted and its request accepted, in the same transaction as the booking. A quote
 * counts as accepted only once paid, so an unpaid hold that lapses leaves the quote open.
 * Kept apart from the request service so the booking service can import it without a cycle.
 */
export async function acceptQuoteForBooking(tx: Tx, bookingId: string) {
  const [q] = await tx
    .update(quotes)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(and(eq(quotes.bookingId, bookingId), eq(quotes.status, 'sent')))
    .returning({ id: quotes.id, requestId: quotes.requestId, version: quotes.version });
  if (!q) return null;
  const [r] = await tx
    .update(serviceRequests)
    .set({ status: 'accepted', bookingId })
    .where(and(eq(serviceRequests.id, q.requestId), eq(serviceRequests.status, 'quoted')))
    .returning({ id: serviceRequests.id });
  if (r) {
    await tx.insert(serviceRequestEvents).values({
      requestId: r.id, fromStatus: 'quoted', toStatus: 'accepted', actorRole: 'system', data: { quoteId: q.id, version: q.version, bookingId },
    });
  }
  return q;
}
