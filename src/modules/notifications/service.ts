import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { notificationOutbox } from '@/platform/db/platform-schema';
import { users } from '../identity/schema';
import type { Tx } from '@/platform/db/client';
import { smsSender } from '@/platform/adapters/sms';
import { log } from '@/platform/logger';

/**
 * Outbox (M16). Every message has an idempotency key; the unique index guarantees a message
 * is queued once and therefore sent at most once, even if the triggering code runs twice.
 */
export async function enqueueNotification(
  tx: Tx,
  n: {
    channel: 'sms' | 'email' | 'push' | 'in_app';
    userId: string;
    template: string;
    payload?: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  await tx
    .insert(notificationOutbox)
    .values({
      channel: n.channel,
      userId: n.userId,
      template: n.template,
      payload: n.payload ?? {},
      idempotencyKey: n.idempotencyKey,
    })
    .onConflictDoNothing();
}

/** Sends pending messages. Runs in system context from the job runner. */
export async function dispatchPending(tx: Tx, batch = 50) {
  const rows = await tx
    .select({ n: notificationOutbox, phone: users.phoneE164 })
    .from(notificationOutbox)
    .leftJoin(users, eq(users.id, notificationOutbox.userId))
    .where(and(eq(notificationOutbox.status, 'pending'), lt(notificationOutbox.attempts, 5)))
    .orderBy(asc(notificationOutbox.createdAt))
    .limit(batch)
    .for('update', { of: notificationOutbox, skipLocked: true });
  let sent = 0;
  for (const { n, phone } of rows) {
    try {
      if (n.channel === 'sms' && phone) {
        await smsSender().send(phone, n.template, Object.fromEntries(Object.entries(n.payload).map(([k, v]) => [k, String(v)])));
      } else {
        log.info('notification (dev, not delivered)', { channel: n.channel, template: n.template });
      }
      await tx.update(notificationOutbox).set({ status: 'sent', sentAt: sql`now()`, attempts: n.attempts + 1 }).where(eq(notificationOutbox.id, n.id));
      sent++;
    } catch (e) {
      await tx
        .update(notificationOutbox)
        .set({ attempts: n.attempts + 1, lastError: String(e).slice(0, 300), status: n.attempts + 1 >= 5 ? 'failed' : 'pending' })
        .where(eq(notificationOutbox.id, n.id));
    }
  }
  return { sent, considered: rows.length };
}
