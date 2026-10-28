import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { bookingAssignments, bookingEvents, bookings, type BookingStatus } from './schema';
import { createBookingInput, slotInput, validateSlot, assertCleanAddress, type CreateBookingInput, type SlotInput } from './validation';
import { services } from '../catalog/schema';
import { cities, zones } from '../geo/schema';
import { users } from '../identity/schema';
import { workerProfiles } from '../workers/schema';
import { payments } from '../payments/schema';
import { loadServiceInCity, type ServiceInCity } from '../catalog/service';
import { findEligibleWorkers } from '../workers/eligibility';
import { computePrice, cancellationFee, type PriceSnapshot } from '../pricing/engine';
import { supplyStatus } from '../seo/supply';
import { postJournal, type JournalLineInput } from '../payments/ledger';
import { enqueueNotification } from '../notifications/service';
import { CONSENT_VERSIONS } from '../identity/service';
import { hasVerifiedId } from '../identity/id-check';
import { acceptQuoteForBooking } from '../requests/accept-hook';
import { consents } from '../identity/schema';
import { anonymousCtx, asSystem, pgCode, PG_EXCLUSION_VIOLATION, withDb, type Ctx, type Tx } from '@/platform/db/client';
import { requirePermission, isStaff } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { AppError, conflict, forbidden, invalid, notFound, unauthenticated } from '@/platform/errors';
import { enforceRateLimit, LIMITS } from '@/platform/rate-limit';
import { getConfig } from '@/platform/config';
import { bookingRef, decrypt, encrypt, hashCode, numericCode, safeEqualHex } from '@/platform/crypto';
import { paymentGateway } from '@/platform/adapters/payments';

// ---------- Search and quote ----------

export interface SearchResult {
  serviceInCity: ServiceInCity;
  live: boolean;
  slot: { startsAt: Date; endsAt: Date } | null;
  quote: PriceSnapshot | null;
  workers: Awaited<ReturnType<typeof findEligibleWorkers>>;
}

function snapshotFor(s: ServiceInCity, durationMinutes: number): PriceSnapshot {
  return computePrice({
    pricing: s.serviceCity.pricing,
    pricingVersion: s.serviceCity.pricingVersion,
    durationMinutes,
    serviceSlug: s.service.slug,
    citySlug: s.city.slug,
    serviceLabel: s.service.name,
  });
}

/** Lists only eligible and genuinely available workers for the requested slot (section 12B). */
export async function searchAvailableWorkers(
  ctx: Ctx,
  raw: SlotInput & { workerGender?: 'female' | 'male' | null; page?: number },
): Promise<SearchResult> {
  const input = slotInput.parse(raw);
  return withDb(ctx, async (tx) => {
    const s = await loadServiceInCity(tx, input.serviceSlug, input.citySlug);
    if (!s) throw notFound('Service');
    const supply = await supplyStatus(tx, ctx, s);
    if (!supply.live) return { serviceInCity: s, live: false, slot: null, quote: null, workers: [] };
    const zone = await tx.select().from(zones).where(and(eq(zones.id, input.zoneId), eq(zones.cityId, s.city.id))).limit(1);
    if (!zone.length) throw invalid('invalid_zone', 'Pick an area in this city', { field: 'zoneId' });
    const slot = validateSlot(s.service.config, input);
    const customerGender = ctx.userId
      ? (await tx.select({ g: users.gender }).from(users).where(eq(users.id, ctx.userId)).limit(1))[0]?.g ?? null
      : null;
    const page = Math.max(1, raw.page ?? 1);
    const workers = await asSystem(tx, ctx, () =>
      findEligibleWorkers(tx, {
        serviceId: s.service.id,
        config: s.service.config,
        cityId: s.city.id,
        zoneId: input.zoneId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        answers: slot.answers,
        workerGender: raw.workerGender ?? null,
        customerGender,
        limit: 21,
        offset: (page - 1) * 20,
      }),
    );
    return { serviceInCity: s, live: true, slot, quote: snapshotFor(s, input.durationMinutes), workers };
  });
}

// ---------- Create (direct booking) ----------

export async function createBooking(ctx: Ctx, raw: CreateBookingInput) {
  requirePermission(ctx, 'booking.create');
  const input = createBookingInput.parse(raw);
  assertCleanAddress(input.addressLine, input.landmark);
  await enforceRateLimit(`booking:create:${ctx.userId}`, LIMITS.bookingCreatePerUser);

  try {
    return await withDb(ctx, async (tx) => {
      const [conduct] = await tx
        .select({ id: consents.id })
        .from(consents)
        .where(and(eq(consents.userId, ctx.userId!), eq(consents.purpose, 'code_of_conduct'),
          eq(consents.version, CONSENT_VERSIONS.code_of_conduct), sql`${consents.withdrawnAt} is null`))
        .limit(1);
      if (!conduct) throw new AppError('conduct_required', 'Please accept the code of conduct before your first booking', 403);

      const s = await loadServiceInCity(tx, input.serviceSlug, input.citySlug);
      if (!s) throw notFound('Service');
      if (s.service.config.customerVerification === 'id' && !(await hasVerifiedId(tx, ctx.userId!))) {
        throw conflict('customer_id_required', 'This service needs a verified ID. Add your ID in your account first.');
      }
      const supply = await supplyStatus(tx, ctx, s);
      if (!supply.live) throw conflict('not_live', `${s.service.name} is not open for booking in ${s.city.name} yet`);
      const [zone] = await tx.select().from(zones).where(and(eq(zones.id, input.zoneId), eq(zones.cityId, s.city.id))).limit(1);
      if (!zone) throw invalid('invalid_zone', 'Pick an area in this city', { field: 'zoneId' });
      const slot = validateSlot(s.service.config, input);

      // Server-side price. The client must have seen exactly this total.
      const snapshot = snapshotFor(s, input.durationMinutes);
      if (snapshot.customer.totalPaise !== input.expectedTotalPaise) {
        throw conflict('price_changed', 'The price has changed. Please review the new total.', {
          totalPaise: snapshot.customer.totalPaise,
        });
      }

      const holdMinutes = await getConfig(tx, 'booking.payment_hold_minutes', { citySlug: s.city.slug, serviceSlug: s.service.slug });
      const customerGender = (await tx.select({ g: users.gender }).from(users).where(eq(users.id, ctx.userId!)).limit(1))[0]?.g ?? null;

      // Critical section: lock the worker, clear stale holds, re-check eligibility and availability.
      await asSystem(tx, ctx, async () => {
        const locked = await tx.select({ id: workerProfiles.id }).from(workerProfiles).where(eq(workerProfiles.id, input.workerId)).for('update');
        if (!locked.length) throw notFound('Worker');
        await expireStaleHolds(tx, { workerId: input.workerId });
        const eligible = await findEligibleWorkers(tx, {
          serviceId: s.service.id,
          config: s.service.config,
          cityId: s.city.id,
          zoneId: zone.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          answers: slot.answers,
          workerId: input.workerId,
          customerGender,
          limit: 1,
        });
        if (!eligible.length) {
          throw conflict('worker_unavailable', 'This person is no longer available for that time. Please pick someone else.');
        }
      });

      const [booking] = await tx
        .insert(bookings)
        .values({
          ref: bookingRef(),
          customerUserId: ctx.userId!,
          serviceId: s.service.id,
          cityId: s.city.id,
          zoneId: zone.id,
          status: 'pending_payment',
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          addressLine: input.addressLine,
          landmark: input.landmark || null,
          answers: slot.answers,
          priceSnapshot: snapshot,
          totalPaise: snapshot.customer.totalPaise,
          pricingVersion: s.serviceCity.pricingVersion,
          holdExpiresAt: sql`now() + make_interval(mins => ${holdMinutes})`,
        })
        .returning();
      if (!booking) throw new Error('booking insert failed');

      await tx.insert(bookingAssignments).values({
        bookingId: booking.id,
        workerId: input.workerId,
        status: 'active',
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      });
      await tx.insert(bookingEvents).values({
        bookingId: booking.id,
        toStatus: 'pending_payment',
        actorUserId: ctx.userId,
        actorRole: 'customer',
        data: { workerId: input.workerId, totalPaise: booking.totalPaise },
      });

      const payment = await openPaymentOrder(tx, booking);
      await audit(tx, ctx, 'booking.created', 'booking', booking.id, { ref: booking.ref, totalPaise: booking.totalPaise });
      return { bookingId: booking.id, ref: booking.ref, totalPaise: booking.totalPaise, holdExpiresAt: booking.holdExpiresAt, payment };
    });
  } catch (e) {
    if (pgCode(e) === PG_EXCLUSION_VIOLATION) {
      throw conflict('worker_unavailable', 'This person was just booked for an overlapping time. Please pick someone else.');
    }
    throw e;
  }
}

/** Opens a gateway order for a new booking. Shared by direct booking and quote acceptance. */
export async function openPaymentOrder(tx: Tx, booking: { id: string; ref: string; totalPaise: number }) {
  const gateway = paymentGateway();
  const order = await gateway.createOrder({ amountPaise: booking.totalPaise, receipt: booking.ref });
  const [payment] = await tx
    .insert(payments)
    .values({
      bookingId: booking.id,
      provider: gateway.provider,
      mode: gateway.mode,
      providerOrderId: order.orderId,
      amountPaise: booking.totalPaise,
      status: 'created',
    })
    .returning({ id: payments.id });
  return { id: payment!.id, provider: gateway.provider, mode: gateway.mode, orderId: order.orderId };
}

/** Workers actively assigned to a booking, oldest first. */
export async function activeTeam(tx: Tx, bookingId: string) {
  return tx
    .select({ workerId: workerProfiles.id, userId: workerProfiles.userId, name: workerProfiles.displayName,
      ratingAvgX100: workerProfiles.ratingAvgX100, ratingCount: workerProfiles.ratingCount })
    .from(bookingAssignments)
    .innerJoin(workerProfiles, eq(workerProfiles.id, bookingAssignments.workerId))
    .where(and(eq(bookingAssignments.bookingId, bookingId), eq(bookingAssignments.status, 'active')))
    .orderBy(asc(bookingAssignments.createdAt));
}

/** Releases payment holds that timed out. Runs in system scope (job or booking transaction). */
export async function expireStaleHolds(tx: Tx, opts: { workerId?: string } = {}) {
  const stale = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .innerJoin(bookingAssignments, eq(bookingAssignments.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, 'pending_payment'),
        lt(bookings.holdExpiresAt, sql`now()`),
        eq(bookingAssignments.status, 'active'),
        opts.workerId ? eq(bookingAssignments.workerId, opts.workerId) : undefined,
      ),
    );
  if (!stale.length) return 0;
  const ids = stale.map((r) => r.id);
  await tx.update(bookings).set({ status: 'expired' }).where(and(inArray(bookings.id, ids), eq(bookings.status, 'pending_payment')));
  await tx
    .update(bookingAssignments)
    .set({ status: 'released', releasedAt: sql`now()` })
    .where(and(inArray(bookingAssignments.bookingId, ids), eq(bookingAssignments.status, 'active')));
  await tx.insert(bookingEvents).values(
    ids.map((id) => ({ bookingId: id, fromStatus: 'pending_payment', toStatus: 'expired', actorRole: 'system', data: { reason: 'payment_hold_timeout' } })),
  );
  return ids.length;
}

// ---------- Confirmation (called by payment processing in system context) ----------

export async function confirmBookingAfterCapture(tx: Tx, bookingId: string) {
  const [b] = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for('update');
  if (!b) throw notFound('Booking');
  if (b.status !== 'pending_payment') return { confirmed: false as const, status: b.status };
  const startCode = numericCode(4);
  const endCode = numericCode(4);
  await tx
    .update(bookings)
    .set({
      status: 'confirmed',
      holdExpiresAt: null,
      startOtpHash: hashCode(`start:${b.id}`, startCode),
      endOtpHash: hashCode(`end:${b.id}`, endCode),
      startOtpEnc: encrypt(Buffer.from(startCode)).toString('base64'),
      endOtpEnc: encrypt(Buffer.from(endCode)).toString('base64'),
    })
    .where(eq(bookings.id, b.id));
  await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: 'pending_payment', toStatus: 'confirmed', actorRole: 'system' });
  await enqueueNotification(tx, { channel: 'sms', userId: b.customerUserId, template: 'booking_confirmed_customer', payload: { ref: b.ref }, idempotencyKey: `confirmed:customer:${b.id}` });
  for (const w of await activeTeam(tx, b.id)) {
    await enqueueNotification(tx, { channel: 'sms', userId: w.userId, template: 'booking_confirmed_worker', payload: { ref: b.ref }, idempotencyKey: `confirmed:worker:${b.id}:${w.workerId}` });
  }
  await acceptQuoteForBooking(tx, b.id);
  return { confirmed: true as const, status: 'confirmed' as const };
}

// ---------- Start and finish with OTP ----------

async function loadWorkerBooking(tx: Tx, ctx: Ctx, bookingId: string) {
  const [row] = await tx
    .select({ booking: bookings, assignment: bookingAssignments, worker: workerProfiles })
    .from(bookings)
    .innerJoin(bookingAssignments, and(eq(bookingAssignments.bookingId, bookings.id), eq(bookingAssignments.status, 'active')))
    .innerJoin(workerProfiles, eq(workerProfiles.id, bookingAssignments.workerId))
    .where(and(eq(bookings.id, bookingId), eq(workerProfiles.userId, ctx.userId!)))
    .limit(1)
    .for('update', { of: bookings });
  if (!row) throw notFound('Booking');
  return row;
}

async function verifyJobCode(ctx: Ctx, bookingId: string, code: string, phase: 'start' | 'end') {
  requirePermission(ctx, 'booking.start_finish');
  if (!/^\d{4}$/.test(code)) throw invalid('invalid_code', 'Enter the 4-digit code from the customer', { field: 'code' });
  await enforceRateLimit(`booking:otp:${bookingId}`, LIMITS.otpEntryPerBooking);

  const outcome = await withDb(ctx, async (tx) => {
    const { booking: b } = await loadWorkerBooking(tx, ctx, bookingId);
    const expected: BookingStatus = phase === 'start' ? 'confirmed' : 'in_progress';
    if (b.status !== expected) return { ok: false as const, error: conflict('wrong_status', phase === 'start' ? 'This job cannot be started now' : 'This job is not in progress') };
    const maxAttempts = await getConfig(tx, 'booking.otp_max_attempts');
    if (b.otpFailedAttempts >= maxAttempts) {
      return { ok: false as const, error: new AppError('otp_locked', 'Too many wrong codes. Our team has been alerted and will help you.', 423) };
    }
    // A team job starts only with every paid place filled; checked first, as it is the more useful message.
    const team = await asSystem(tx, ctx, () => activeTeam(tx, b.id));
    if (phase === 'start' && team.length < b.workersNeeded) {
      return { ok: false as const, error: conflict('team_incomplete', 'Not everyone on this job is confirmed yet. Our team is arranging the rest; please contact support.') };
    }
    if (phase === 'start') {
      const win = await getConfig(tx, 'booking.start_window');
      const now = Date.now();
      if (now < b.startsAt.getTime() - win.beforeMinutes * 60_000 || now > b.startsAt.getTime() + win.afterMinutes * 60_000) {
        return { ok: false as const, error: conflict('outside_start_window', 'You can start this job closer to the booked time') };
      }
    }
    const hash = phase === 'start' ? b.startOtpHash : b.endOtpHash;
    if (!hash || !safeEqualHex(hash, hashCode(`${phase}:${b.id}`, code))) {
      const attempts = b.otpFailedAttempts + 1;
      await tx.update(bookings).set({ otpFailedAttempts: attempts }).where(eq(bookings.id, b.id));
      await audit(tx, ctx, `booking.${phase}_code_wrong`, 'booking', b.id, { attempts });
      return { ok: false as const, error: invalid('wrong_code', 'That code does not match. Ask the customer to read it from their booking page.', { field: 'code', attempts }) };
    }
    const to: BookingStatus = phase === 'start' ? 'in_progress' : 'completed';
    await tx
      .update(bookings)
      .set(phase === 'start' ? { status: to, startedAt: sql`now()`, otpFailedAttempts: 0 } : { status: to, completedAt: sql`now()`, otpFailedAttempts: 0 })
      .where(eq(bookings.id, b.id));
    await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: b.status, toStatus: to, actorUserId: ctx.userId, actorRole: 'worker' });
    if (phase === 'end') {
      await asSystem(tx, ctx, async () => {
        await postCompletionJournal(tx, b, team.map((w) => w.workerId));
        await enqueueNotification(tx, { channel: 'in_app', userId: b.customerUserId, template: 'rate_your_booking', payload: { ref: b.ref }, idempotencyKey: `rate:customer:${b.id}` });
        for (const w of team) {
          await enqueueNotification(tx, { channel: 'in_app', userId: w.userId, template: 'rate_your_customer', payload: { ref: b.ref }, idempotencyKey: `rate:worker:${b.id}:${w.workerId}` });
        }
      });
    }
    await audit(tx, ctx, phase === 'start' ? 'booking.started' : 'booking.completed', 'booking', b.id);
    return { ok: true as const, status: to };
  });
  if (!outcome.ok) throw outcome.error;
  return outcome;
}

export const startJob = (ctx: Ctx, bookingId: string, code: string) => verifyJobCode(ctx, bookingId, code, 'start');
export const finishJob = (ctx: Ctx, bookingId: string, code: string) => verifyJobCode(ctx, bookingId, code, 'end');

/**
 * Completion journal straight from the booking's price snapshot (price shown = snapshot = ledger).
 * The worker_payable allocation is split into one line per assigned person, each the snapshot's
 * per-person net, so a team booking pays everyone the same amount and still balances.
 */
async function postCompletionJournal(tx: Tx, b: typeof bookings.$inferSelect, workerIds: string[]) {
  const snap = b.priceSnapshot;
  const people = snap.workersCount ?? 1;
  if (workerIds.length !== people) throw new Error(`booking ${b.ref} has ${workerIds.length} active workers for ${people} paid places`);
  await postJournal(tx, {
    kind: 'completion',
    bookingId: b.id,
    memo: `Booking ${b.ref} completed`,
    idempotencyKey: `completion:${b.id}`,
    createdBy: 'system',
    lines: [
      { account: 'customer_funds_held', debitPaise: snap.customer.totalPaise, lineCode: 'release_held_funds' },
      ...snap.allocations.flatMap((a): JournalLineInput[] =>
        a.account === 'worker_payable'
          ? workerIds.map((id) => ({ account: a.account, owner: { type: 'worker', id }, creditPaise: snap.worker.netPaise, lineCode: a.account }))
          : [{ account: a.account, creditPaise: a.amountPaise, lineCode: a.account }],
      ),
    ],
  });
}

// ---------- Cancellation (policy-based; refund execution lands in Milestone 3) ----------

export async function cancelBooking(ctx: Ctx, input: { bookingId: string; reason: string; feltUnsafe?: boolean }) {
  requirePermission(ctx, 'booking.cancel');
  const reason = input.reason.trim().slice(0, 300);
  if (!reason) throw invalid('reason_required', 'Tell us why you are cancelling', { field: 'reason' });
  return withDb(ctx, async (tx) => {
    const [b] = await tx.select().from(bookings).where(eq(bookings.id, input.bookingId)).limit(1).for('update');
    if (!b) throw notFound('Booking');
    const asCustomer = b.customerUserId === ctx.userId;
    const asWorker = !asCustomer && (await tx.select({ id: bookingAssignments.id }).from(bookingAssignments)
      .innerJoin(workerProfiles, eq(workerProfiles.id, bookingAssignments.workerId))
      .where(and(eq(bookingAssignments.bookingId, b.id), eq(workerProfiles.userId, ctx.userId ?? ''))).limit(1)).length > 0;
    const asStaff = isStaff(ctx);
    if (!asCustomer && !asWorker && !asStaff) throw notFound('Booking');
    if (b.status !== 'pending_payment' && b.status !== 'confirmed') throw conflict('cannot_cancel', 'This booking can no longer be cancelled here. Contact support.');

    const hoursBefore = (b.startsAt.getTime() - Date.now()) / 3_600_000;
    const config = (await tx.select({ config: services.config }).from(services).where(eq(services.id, b.serviceId)))[0]!.config;
    const fee = asCustomer && b.status === 'confirmed'
      ? cancellationFee(config.cancellationPolicy, b.totalPaise, hoursBefore)
      : { feePaise: 0, band: 'none' as const };
    const by = asCustomer ? 'customer' : asWorker ? 'worker' : 'staff';

    if (asWorker && b.workersNeeded > 1) {
      // The booking stays on; the empty place shows as a partial fill for ops to refill.
      await asSystem(tx, ctx, async () => {
        await tx.update(bookingAssignments).set({ status: 'released', releasedAt: sql`now()` })
          .where(and(eq(bookingAssignments.bookingId, b.id), eq(bookingAssignments.status, 'active'),
            sql`${bookingAssignments.workerId} in (select id from worker_profiles where user_id = ${ctx.userId})`));
      });
      await audit(tx, ctx, 'booking.worker_left_team', 'booking', b.id, { reason, feltUnsafe: !!input.feltUnsafe });
      return { feePaise: 0, band: 'none' as const, leftTeam: true as const };
    }

    await tx.update(bookings).set({ status: 'cancelled', cancelledAt: sql`now()`, cancelledBy: by, cancelReason: reason }).where(eq(bookings.id, b.id));
    await asSystem(tx, ctx, async () => {
      await tx.update(bookingAssignments).set({ status: 'released', releasedAt: sql`now()` })
        .where(and(eq(bookingAssignments.bookingId, b.id), eq(bookingAssignments.status, 'active')));
      await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: b.status, toStatus: 'cancelled', actorUserId: ctx.userId, actorRole: by,
        data: { reason, feePaise: fee.feePaise, band: fee.band, feltUnsafe: !!input.feltUnsafe } });
      if (b.status === 'confirmed') {
        const refundable = b.totalPaise - fee.feePaise;
        await postJournal(tx, {
          kind: 'cancellation',
          bookingId: b.id,
          memo: `Booking ${b.ref} cancelled by ${by}`,
          idempotencyKey: `cancellation:${b.id}`,
          createdBy: ctx.userId ?? 'system',
          lines: [
            { account: 'customer_funds_held', debitPaise: b.totalPaise, lineCode: 'release_held_funds' },
            { account: 'refunds_payable', creditPaise: refundable, lineCode: 'refund_due' },
            { account: 'cancellation_fee_revenue', creditPaise: fee.feePaise, lineCode: 'cancellation_fee' },
          ],
        });
      }
    });
    await audit(tx, ctx, 'booking.cancelled', 'booking', b.id, { by, feePaise: fee.feePaise, feltUnsafe: !!input.feltUnsafe });
    return { feePaise: fee.feePaise, band: fee.band };
  });
}

// ---------- Read models ----------

const bookingListColumns = {
  id: bookings.id,
  ref: bookings.ref,
  status: bookings.status,
  startsAt: bookings.startsAt,
  endsAt: bookings.endsAt,
  totalPaise: bookings.totalPaise,
  serviceName: services.name,
  serviceSlug: services.slug,
  cityName: cities.name,
  zoneName: zones.name,
};

/** Names of everyone actively on a booking, in assignment order (null when nobody is yet). */
const teamNames = sql<string | null>`(
  select string_agg(wp.display_name, ', ' order by ba.created_at)
  from booking_assignments ba join worker_profiles wp on wp.id = ba.worker_id
  where ba.booking_id = ${bookings.id} and ba.status = 'active')`;
const teamAssigned = sql<number>`(
  select count(*)::int from booking_assignments ba where ba.booking_id = ${bookings.id} and ba.status = 'active')`;

export async function listMyBookings(ctx: Ctx) {
  if (!ctx.userId) throw unauthenticated();
  return withDb(ctx, (tx) =>
    tx
      .select({ ...bookingListColumns, workerName: teamNames, workersNeeded: bookings.workersNeeded, assigned: teamAssigned })
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(cities, eq(cities.id, bookings.cityId))
      .innerJoin(zones, eq(zones.id, bookings.zoneId))
      .where(eq(bookings.customerUserId, ctx.userId!))
      .orderBy(desc(bookings.startsAt))
      .limit(100),
  );
}

export async function listWorkerJobs(ctx: Ctx) {
  requirePermission(ctx, 'booking.start_finish');
  return withDb(ctx, (tx) =>
    tx
      .select({ ...bookingListColumns, workersNeeded: bookings.workersNeeded })
      .from(bookings)
      .innerJoin(bookingAssignments, and(eq(bookingAssignments.bookingId, bookings.id), eq(bookingAssignments.status, 'active')))
      .innerJoin(workerProfiles, eq(workerProfiles.id, bookingAssignments.workerId))
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(cities, eq(cities.id, bookings.cityId))
      .innerJoin(zones, eq(zones.id, bookings.zoneId))
      .where(and(eq(workerProfiles.userId, ctx.userId!), inArray(bookings.status, ['confirmed', 'in_progress', 'completed', 'cancelled', 'no_show_customer', 'no_show_worker'])))
      .orderBy(desc(bookings.startsAt))
      .limit(100),
  );
}

/**
 * Booking detail for whoever is asking. RLS returns no row to anyone who is not the customer,
 * the assigned worker, or staff, so other users get 404 even when calling the API directly.
 */
export async function getBookingForViewer(ctx: Ctx, bookingId: string) {
  if (!ctx.userId) throw unauthenticated();
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) throw notFound('Booking');
  requirePermission(ctx, 'booking.read');
  return withDb(ctx, async (tx) => {
    const [row] = await tx
      .select({
        booking: bookings,
        serviceName: services.name,
        serviceSlug: services.slug,
        serviceConfig: services.config,
        cityName: cities.name,
        citySlug: cities.slug,
        zoneName: zones.name,
      })
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(cities, eq(cities.id, bookings.cityId))
      .innerJoin(zones, eq(zones.id, bookings.zoneId))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!row) throw notFound('Booking');
    const b = row.booking;
    // Active team, or for a finished-off booking (cancelled, expired) the people who were on it.
    const everyone = await tx
      .select({ workerId: workerProfiles.id, workerName: workerProfiles.displayName, workerUserId: workerProfiles.userId,
        ratingAvgX100: workerProfiles.ratingAvgX100, ratingCount: workerProfiles.ratingCount, status: bookingAssignments.status })
      .from(bookingAssignments)
      .innerJoin(workerProfiles, eq(workerProfiles.id, bookingAssignments.workerId))
      .where(eq(bookingAssignments.bookingId, b.id))
      .orderBy(asc(bookingAssignments.createdAt));
    const active = everyone.filter((a) => a.status === 'active');
    const team = active.length || b.workersNeeded > 1 ? active : everyone.slice(-1);
    const viewer: 'customer' | 'worker' | 'staff' =
      b.customerUserId === ctx.userId ? 'customer' : everyone.some((a) => a.workerUserId === ctx.userId) ? 'worker' : 'staff';
    if (viewer === 'staff' && !isStaff(ctx)) throw forbidden();
    const [customer] = await tx.select({ name: users.displayName }).from(users).where(eq(users.id, b.customerUserId)).limit(1);
    const [payment] = await tx
      .select({ id: payments.id, status: payments.status, mode: payments.mode, provider: payments.provider, orderId: payments.providerOrderId })
      .from(payments).where(eq(payments.bookingId, b.id)).orderBy(desc(payments.createdAt)).limit(1);
    const events = await tx.select().from(bookingEvents).where(eq(bookingEvents.bookingId, b.id)).orderBy(bookingEvents.at);

    const decode = (enc: string | null) => (enc ? decrypt(Buffer.from(enc, 'base64')).toString() : null);
    const codes =
      viewer === 'customer'
        ? {
            start: b.status === 'confirmed' ? decode(b.startOtpEnc) : null,
            end: b.status === 'in_progress' ? decode(b.endOtpEnc) : null,
          }
        : { start: null, end: null };
    const showAddress = viewer !== 'worker' || ['confirmed', 'in_progress', 'completed'].includes(b.status);

    return {
      viewer,
      id: b.id,
      ref: b.ref,
      status: b.status,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      serviceName: row.serviceName,
      serviceSlug: row.serviceSlug,
      cityName: row.cityName,
      citySlug: row.citySlug,
      zoneName: row.zoneName,
      addressLine: showAddress ? b.addressLine : null,
      landmark: showAddress ? b.landmark : null,
      answers: b.answers,
      answersDisplay: row.serviceConfig.questions
        .filter((q) => b.answers[q.id] !== undefined && b.answers[q.id] !== '')
        .map((q) => ({
          label: q.label,
          value: q.options?.find((o) => o.value === String(b.answers[q.id]))?.label ?? String(b.answers[q.id]),
        })),
      price: viewer === 'worker' ? null : b.priceSnapshot.customer,
      workerEarning: viewer === 'customer' ? null : b.priceSnapshot.worker,
      totalPaise: viewer === 'worker' ? null : b.totalPaise,
      holdExpiresAt: b.holdExpiresAt,
      cancellationPolicy: row.serviceConfig.cancellationPolicy,
      holdExpired: b.status === 'pending_payment' && !!b.holdExpiresAt && b.holdExpiresAt.getTime() < Date.now(),
      cancelFeeNowPaise:
        viewer === 'customer' && b.status === 'confirmed'
          ? cancellationFee(row.serviceConfig.cancellationPolicy, b.totalPaise, (b.startsAt.getTime() - Date.now()) / 3_600_000).feePaise
          : 0,
      cancelReason: b.cancelReason,
      cancelledBy: b.cancelledBy,
      workers: team.map((a) => ({ id: a.workerId, name: a.workerName, ratingAvgX100: a.ratingAvgX100, ratingCount: a.ratingCount })),
      /** First person on the booking; kept for API clients written for one-person bookings. */
      worker: team[0] ? { id: team[0].workerId, name: team[0].workerName, ratingAvgX100: team[0].ratingAvgX100, ratingCount: team[0].ratingCount } : null,
      workersNeeded: b.workersNeeded,
      customerName: viewer === 'customer' ? null : customer?.name ?? 'Customer',
      payment: viewer === 'worker' ? null : payment ?? null,
      codes,
      otpLocked: b.otpFailedAttempts >= (await getConfig(tx, 'booking.otp_max_attempts')),
      events: events.map((e) => ({ at: e.at, from: e.fromStatus, to: e.toStatus, by: e.actorRole })),
    };
  });
}

export async function listBookingsForAdmin(ctx: Ctx, opts: { status?: string; q?: string; page?: number; needsPeople?: boolean }) {
  requirePermission(ctx, 'booking.read_all');
  const page = Math.max(1, opts.page ?? 1);
  return withDb(ctx, async (tx) => {
    const conds = [];
    if (opts.status) conds.push(eq(bookings.status, opts.status as BookingStatus));
    if (opts.q) conds.push(sql`${bookings.ref} ilike ${'%' + opts.q.replace(/[%_]/g, '') + '%'}`);
    // Partial fill: paid places without a person, on bookings that are still going ahead.
    if (opts.needsPeople) conds.push(inArray(bookings.status, ['pending_payment', 'confirmed']), sql`${teamAssigned} < ${bookings.workersNeeded}`);
    const rows = await tx
      .select({ ...bookingListColumns, workerName: teamNames, customerName: users.displayName, workersNeeded: bookings.workersNeeded, assigned: teamAssigned })
      .from(bookings)
      .innerJoin(services, eq(services.id, bookings.serviceId))
      .innerJoin(cities, eq(cities.id, bookings.cityId))
      .innerJoin(zones, eq(zones.id, bookings.zoneId))
      .innerJoin(users, eq(users.id, bookings.customerUserId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(bookings.createdAt))
      .limit(26)
      .offset((page - 1) * 25);
    return { rows: rows.slice(0, 25), hasNext: rows.length > 25, page };
  });
}

/** Public worker profile (section 12A). Only public fields; noindex by default. */
export async function getPublicWorkerProfile(workerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(workerId)) return null;
  return withDb(anonymousCtx(), async (tx) => {
    const [wp] = await tx
      .select({
        id: workerProfiles.id, displayName: workerProfiles.displayName, bio: workerProfiles.bio, languages: workerProfiles.languages,
        yearsExperience: workerProfiles.yearsExperience, ratingAvgX100: workerProfiles.ratingAvgX100, ratingCount: workerProfiles.ratingCount,
        kycStatus: workerProfiles.kycStatus, photoStatus: workerProfiles.photoStatus, searchIndexOptIn: workerProfiles.searchIndexOptIn,
        homeCity: cities.name,
      })
      .from(workerProfiles)
      .leftJoin(cities, eq(cities.id, workerProfiles.homeCityId))
      .where(and(eq(workerProfiles.id, workerId), eq(workerProfiles.status, 'active')))
      .limit(1);
    return wp ?? null;
  });
}
