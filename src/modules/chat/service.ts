import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { chatMessages, moderationFlags, reports } from './schema';
import { scanText, explainBlock } from './moderation';
import { bookings } from '../bookings/schema';
import { withDb, type Ctx } from '@/platform/db/client';
import { requirePermission } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { conflict, notFound } from '@/platform/errors';
import { enforceRateLimit, LIMITS } from '@/platform/rate-limit';

const OPEN_FOR_CHAT = ['pending_payment', 'confirmed', 'in_progress', 'completed'];

export const chatInput = z.object({ body: z.string().trim().min(1, 'Type a message').max(1000) });

/**
 * Booking chat (M16). Messages are scanned before delivery:
 *  - block: stored as blocked (visible to sender with an explanation, and to moderators), flag raised
 *  - review: held for moderation, not delivered
 *  - allow: delivered
 */
export async function sendChatMessage(ctx: Ctx, bookingId: string, raw: { body: string }) {
  requirePermission(ctx, 'chat.read_write');
  const { body } = chatInput.parse(raw);
  await enforceRateLimit(`chat:${ctx.userId}`, LIMITS.chatPerUser);
  const scan = scanText(body);
  return withDb(ctx, async (tx) => {
    // RLS hides bookings the sender is not part of.
    const [b] = await tx.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!b) throw notFound('Booking');
    if (!OPEN_FOR_CHAT.includes(b.status)) throw conflict('chat_closed', 'Chat is closed for this booking');
    const status = scan.action === 'allow' ? 'delivered' : scan.action === 'block' ? 'blocked' : 'held_for_review';
    const [msg] = await tx
      .insert(chatMessages)
      .values({ bookingId, senderUserId: ctx.userId!, body, status, blockReasons: scan.reasons })
      .returning();
    if (scan.action !== 'allow') {
      await tx.insert(moderationFlags).values({
        entityType: 'chat_message',
        entityId: msg!.id,
        userId: ctx.userId,
        reasons: scan.reasons,
        severity: scan.action === 'block' ? 'block' : 'review',
      });
      await audit(tx, ctx, `chat.message_${status}`, 'chat_message', msg!.id, { reasons: scan.reasons, bookingId });
    }
    return {
      id: msg!.id,
      status,
      notice: scan.action === 'allow' ? null : explainBlock(scan.reasons),
    };
  });
}

export async function listChatMessages(ctx: Ctx, bookingId: string) {
  requirePermission(ctx, 'chat.read_write');
  return withDb(ctx, async (tx) => {
    const [b] = await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!b) throw notFound('Booking');
    const rows = await tx
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.bookingId, bookingId))
      .orderBy(asc(chatMessages.createdAt))
      .limit(200);
    return rows.map((m) => ({
      id: m.id,
      mine: m.senderUserId === ctx.userId,
      body: m.body,
      status: m.status,
      notice: m.status === 'delivered' ? null : explainBlock(m.blockReasons as never),
      createdAt: m.createdAt,
    }));
  });
}

export const reportInput = z.object({
  entityType: z.enum(['worker_profile', 'booking', 'chat_message', 'user']),
  entityId: z.string().uuid(),
  reason: z.enum(['safety', 'inappropriate', 'off_platform_payment', 'harassment', 'fake_profile', 'other']),
  details: z.string().trim().max(1000).optional(),
});

/** One-tap report on a profile, booking or chat (section 5). */
export async function createReport(ctx: Ctx, raw: z.infer<typeof reportInput>) {
  requirePermission(ctx, 'report.create');
  const input = reportInput.parse(raw);
  return withDb(ctx, async (tx) => {
    const [r] = await tx
      .insert(reports)
      .values({ reporterUserId: ctx.userId!, entityType: input.entityType, entityId: input.entityId, reason: input.reason, details: input.details ?? null })
      .returning({ id: reports.id });
    await audit(tx, ctx, 'report.created', input.entityType, input.entityId, { reason: input.reason });
    return r!;
  });
}

export async function moderationQueue(ctx: Ctx) {
  requirePermission(ctx, 'chat.moderate');
  return withDb(ctx, async (tx) => {
    const flags = await tx
      .select({ flag: moderationFlags, body: chatMessages.body, bookingId: chatMessages.bookingId })
      .from(moderationFlags)
      .leftJoin(chatMessages, and(eq(moderationFlags.entityType, 'chat_message'), sql`${chatMessages.id}::text = ${moderationFlags.entityId}`))
      .where(eq(moderationFlags.status, 'open'))
      .orderBy(asc(moderationFlags.createdAt))
      .limit(100);
    const openReports = await tx.select().from(reports).where(eq(reports.status, 'open')).orderBy(asc(reports.createdAt)).limit(100);
    return { flags, reports: openReports };
  });
}

