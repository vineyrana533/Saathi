import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ratings } from './schema';
import { bookings, bookingAssignments } from '../bookings/schema';
import { workerProfiles } from '../workers/schema';
import { moderationFlags } from '../chat/schema';
import { scanText } from '../chat/moderation';
import { asSystem, withDb, anonymousCtx, type Ctx } from '@/platform/db/client';
import { requirePermission } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { conflict, notFound } from '@/platform/errors';
import { getConfig } from '@/platform/config';

export const ratingInput = z.object({
  score: z.coerce.number().int().min(1, 'Pick 1 to 5 stars').max(5),
  comment: z.string().trim().max(500).optional(),
});

/**
 * Two-way ratings (M20). Allowed once per direction, only after completion.
 * Low scores go to quality review; comments that fail the content scan are held.
 */
export async function rateBooking(ctx: Ctx, bookingId: string, raw: z.infer<typeof ratingInput>) {
  requirePermission(ctx, 'rating.create');
  const input = ratingInput.parse(raw);
  return withDb(ctx, async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!b) throw notFound('Booking');
    if (b.status !== 'completed') throw conflict('not_completed', 'You can rate a booking after it is completed');
    const [a] = await tx
      .select({ workerId: workerProfiles.id, workerUserId: workerProfiles.userId })
      .from(bookingAssignments)
      .innerJoin(workerProfiles, eq(workerProfiles.id, bookingAssignments.workerId))
      .where(and(eq(bookingAssignments.bookingId, b.id), eq(bookingAssignments.status, 'active')))
      .limit(1);
    if (!a) throw notFound('Booking');
    const direction =
      b.customerUserId === ctx.userId ? 'customer_to_worker' : a.workerUserId === ctx.userId ? 'worker_to_customer' : null;
    if (!direction) throw notFound('Booking');

    const lowThreshold = await getConfig(tx, 'quality.low_rating_threshold');
    const scan = input.comment ? scanText(input.comment) : { action: 'allow' as const, reasons: [] };
    const status = scan.action === 'allow' ? 'visible' : 'pending_review';
    const inserted = await tx
      .insert(ratings)
      .values({
        bookingId: b.id,
        raterUserId: ctx.userId!,
        rateeUserId: direction === 'customer_to_worker' ? a.workerUserId : b.customerUserId,
        direction,
        score: input.score,
        comment: input.comment || null,
        status,
      })
      .onConflictDoNothing()
      .returning({ id: ratings.id });
    if (!inserted.length) throw conflict('already_rated', 'You have already rated this booking');

    if (input.score <= lowThreshold || status !== 'visible') {
      await tx.insert(moderationFlags).values({
        entityType: 'rating',
        entityId: inserted[0]!.id,
        userId: ctx.userId,
        reasons: input.score <= lowThreshold ? ['low_rating', ...scan.reasons] : scan.reasons,
        severity: 'review',
      });
    }
    if (direction === 'customer_to_worker') {
      await asSystem(tx, ctx, async () => {
        await tx.execute(sql`
          update worker_profiles wp set
            rating_count = s.n,
            rating_avg_x100 = s.avg_x100
          from (
            select count(*)::int as n, coalesce(round(avg(r.score) * 100), 0)::int as avg_x100
            from ratings r where r.ratee_user_id = ${a.workerUserId} and r.direction = 'customer_to_worker'
          ) s
          where wp.id = ${a.workerId}`);
      });
    }
    await audit(tx, ctx, 'rating.created', 'booking', b.id, { direction, score: input.score });
    return { id: inserted[0]!.id, status };
  });
}

export async function myRatingFor(ctx: Ctx, bookingId: string) {
  return withDb(ctx, async (tx) => {
    const [r] = await tx
      .select({ score: ratings.score, comment: ratings.comment })
      .from(ratings)
      .where(and(eq(ratings.bookingId, bookingId), eq(ratings.raterUserId, ctx.userId ?? '00000000-0000-0000-0000-000000000000')))
      .limit(1);
    return r ?? null;
  });
}

/** Visible reviews of a worker (only from completed bookings, by construction). */
export async function workerReviews(workerId: string) {
  return withDb(anonymousCtx(), async (tx) => {
    const [wp] = await tx.select({ userId: workerProfiles.userId }).from(workerProfiles).where(eq(workerProfiles.id, workerId)).limit(1);
    if (!wp) return [];
    return tx
      .select({ score: ratings.score, comment: ratings.comment, createdAt: ratings.createdAt })
      .from(ratings)
      .where(and(eq(ratings.rateeUserId, wp.userId), eq(ratings.direction, 'customer_to_worker'), eq(ratings.status, 'visible')))
      .orderBy(desc(ratings.createdAt))
      .limit(20);
  });
}

