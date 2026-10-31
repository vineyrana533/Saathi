import { and, eq, sql } from 'drizzle-orm';
import { bookingAssignments, bookings } from './schema';
import { activeTeam, expireStaleHolds } from './service';
import { services } from '../catalog/schema';
import { serviceConfigSchema } from '../catalog/config';
import { users } from '../identity/schema';
import { workerProfiles } from '../workers/schema';
import { findEligibleWorkers } from '../workers/eligibility';
import { enqueueNotification } from '../notifications/service';
import { asSystem, pgCode, PG_EXCLUSION_VIOLATION, withDb, type Ctx, type Tx } from '@/platform/db/client';
import { requirePermission } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { conflict, invalid, notFound } from '@/platform/errors';

/**
 * Team bookings (Milestone 2): a booking pays for `workers_needed` people and each person is a
 * `booking_assignments` row. The exclusion constraint on assignment slots still stops anyone
 * being on two overlapping jobs, whichever way they were assigned.
 */

type BookingRow = typeof bookings.$inferSelect;

async function slotParams(tx: Tx, b: BookingRow) {
  const [svc] = await tx.select({ config: services.config }).from(services).where(eq(services.id, b.serviceId)).limit(1);
  const [customer] = await tx.select({ gender: users.gender }).from(users).where(eq(users.id, b.customerUserId)).limit(1);
  return {
    serviceId: b.serviceId,
    config: serviceConfigSchema.parse(svc!.config),
    cityId: b.cityId,
    zoneId: b.zoneId,
    jobPoint: b.jobLat != null && b.jobLng != null ? { lat: b.jobLat, lng: b.jobLng } : null,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    answers: b.answers,
    customerGender: customer?.gender ?? null,
  };
}

/**
 * Puts one worker on a booking if they are still eligible and free. Must run in system scope
 * inside the caller's transaction. Uses a savepoint, so an overlap only skips this worker.
 */
export async function tryAssign(tx: Tx, b: BookingRow, workerId: string): Promise<'assigned' | 'unavailable'> {
  const locked = await tx.select({ id: workerProfiles.id }).from(workerProfiles).where(eq(workerProfiles.id, workerId)).for('update');
  if (!locked.length) return 'unavailable';
  await expireStaleHolds(tx, { workerId });
  const eligible = await findEligibleWorkers(tx, { ...(await slotParams(tx, b)), workerId, limit: 1 });
  if (!eligible.length) return 'unavailable';
  try {
    await tx.transaction(async (sp) => {
      await sp.insert(bookingAssignments).values({ bookingId: b.id, workerId, status: 'active', startsAt: b.startsAt, endsAt: b.endsAt });
    });
    return 'assigned';
  } catch (e) {
    if (pgCode(e) === PG_EXCLUSION_VIOLATION) return 'unavailable';
    throw e;
  }
}

async function lockOpenBooking(tx: Tx, bookingId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for('update');
  if (!b) throw notFound('Booking');
  if (b.status !== 'pending_payment' && b.status !== 'confirmed') throw conflict('team_locked', 'People can only be changed before the job starts');
  return b;
}

/** Ops fills an empty place on a booking. */
export async function assignWorkerToBooking(ctx: Ctx, input: { bookingId: string; workerId: string }) {
  requirePermission(ctx, 'booking.assign');
  return withDb(ctx, async (tx) => {
    const b = await lockOpenBooking(tx, input.bookingId);
    const team = await activeTeam(tx, b.id);
    if (team.some((w) => w.workerId === input.workerId)) throw conflict('already_on_team', 'This person is already on the booking');
    if (team.length >= b.workersNeeded) throw conflict('team_full', 'Every paid place is already filled');
    const outcome = await asSystem(tx, ctx, () => tryAssign(tx, b, input.workerId));
    if (outcome === 'unavailable') {
      throw conflict('worker_unavailable', 'This person is not free, not approved for this service, or does not work in this area');
    }
    await asSystem(tx, ctx, async () => {
      const [w] = await tx.select({ userId: workerProfiles.userId }).from(workerProfiles).where(eq(workerProfiles.id, input.workerId));
      if (w && b.status === 'confirmed') {
        await enqueueNotification(tx, { channel: 'sms', userId: w.userId, template: 'booking_confirmed_worker', payload: { ref: b.ref },
          idempotencyKey: `confirmed:worker:${b.id}:${input.workerId}` });
      }
    });
    await audit(tx, ctx, 'booking.worker_assigned', 'booking', b.id, { workerId: input.workerId, filled: team.length + 1, needed: b.workersNeeded });
    return { filled: team.length + 1, needed: b.workersNeeded };
  });
}

/** Ops takes someone off a booking before it starts; the place shows as empty until refilled. */
export async function releaseWorkerFromBooking(ctx: Ctx, input: { bookingId: string; workerId: string; reason: string }) {
  requirePermission(ctx, 'booking.assign');
  const reason = input.reason.trim().slice(0, 300);
  if (!reason) throw invalid('reason_required', 'Add a reason', { field: 'reason' });
  return withDb(ctx, async (tx) => {
    const b = await lockOpenBooking(tx, input.bookingId);
    const released = await tx
      .update(bookingAssignments)
      .set({ status: 'released', releasedAt: sql`now()` })
      .where(and(eq(bookingAssignments.bookingId, b.id), eq(bookingAssignments.workerId, input.workerId), eq(bookingAssignments.status, 'active')))
      .returning({ id: bookingAssignments.id });
    if (!released.length) throw notFound('Assignment');
    await audit(tx, ctx, 'booking.worker_released', 'booking', b.id, { workerId: input.workerId, reason });
  });
}

/** Eligible, free people for the booking's slot and area who are not already on it. */
export async function teamSuggestions(ctx: Ctx, bookingId: string) {
  requirePermission(ctx, 'booking.assign');
  return withDb(ctx, async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
    if (!b) throw notFound('Booking');
    const team = await activeTeam(tx, b.id);
    const found = await asSystem(tx, ctx, async () => findEligibleWorkers(tx, { ...(await slotParams(tx, b)), limit: 40 }));
    return found.filter((w) => !team.some((t) => t.workerId === w.id));
  });
}
