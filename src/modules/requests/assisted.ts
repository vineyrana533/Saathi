import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { OPEN_REQUEST_STATUSES, quotes, serviceRequestEvents, serviceRequests, type RequestStatus } from './schema';
import { services } from '../catalog/schema';
import { cities, zones } from '../geo/schema';
import { consents, users } from '../identity/schema';
import { workerProfiles } from '../workers/schema';
import { bookingAssignments, bookingEvents, bookings } from '../bookings/schema';
import { moderationFlags } from '../chat/schema';
import { loadServiceInCity, type ServiceInCity } from '../catalog/service';
import { findEligibleWorkers } from '../workers/eligibility';
import { assertCleanAddress, validateSlot } from '../bookings/validation';
import { openPaymentOrder } from '../bookings/service';
import { tryAssign } from '../bookings/team';
import { computePrice } from '../pricing/engine';
import { hasVerifiedId } from '../identity/id-check';
import { CONSENT_VERSIONS } from '../identity/service';
import { explainBlock, scanText } from '../chat/moderation';
import { enqueueNotification } from '../notifications/service';
import { asSystem, withDb, type Ctx, type Tx } from '@/platform/db/client';
import { requirePermission } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { AppError, conflict, invalid, notFound } from '@/platform/errors';
import { enforceRateLimit, LIMITS } from '@/platform/rate-limit';
import { getConfig } from '@/platform/config';
import { addBusinessMinutes, istParts, minutesToHhmm } from '@/platform/time';
import { bookingRef } from '@/platform/crypto';

/**
 * Assisted matching and quotes (M07, M08, Milestone 2; docs/booking-lifecycle.md sections 5 and 6).
 *
 * Customer: describes a job (people, time, place, details) and gets a first response within
 * 2 business hours (config). Ops: owns the request, finds eligible people, sends a quote valid for
 * 48 hours (config). Customer: accepts and pays, asks for changes, or declines. Paying for an
 * accepted quote confirms a booking for the whole team in the same transaction as the payment.
 *
 * Every status change writes a `service_request_events` row and an audit entry; a database
 * trigger rejects any transition not in the lifecycle.
 */

const UUID = /^[0-9a-f-]{36}$/i;

function requestRef(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'RQ-';
  for (let i = 0; i < 7; i++) out += alphabet[randomInt(0, alphabet.length)];
  return out;
}

type Role = 'customer' | 'staff' | 'system';

async function recordEvent(
  tx: Tx,
  ctx: Ctx | null,
  e: { requestId: string; from: RequestStatus | null; to: RequestStatus; role: Role; data?: Record<string, unknown> },
) {
  await tx.insert(serviceRequestEvents).values({
    requestId: e.requestId, fromStatus: e.from, toStatus: e.to, actorUserId: ctx?.userId ?? null, actorRole: e.role, data: e.data ?? {},
  });
}

/** Requests are taken where the city is open and the service is on, even below the supply threshold. */
function requestsOpen(s: ServiceInCity) {
  if (s.service.status !== 'active' || s.city.status !== 'live' || s.serviceCity.status === 'paused') return false;
  return s.service.riskTier === 'A' || (!!s.service.featureFlagKey && s.flagEnabled);
}

async function requireConduct(tx: Tx, ctx: Ctx) {
  const [conduct] = await tx
    .select({ id: consents.id })
    .from(consents)
    .where(and(eq(consents.userId, ctx.userId!), eq(consents.purpose, 'code_of_conduct'),
      eq(consents.version, CONSENT_VERSIONS.code_of_conduct), sql`${consents.withdrawnAt} is null`))
    .limit(1);
  if (!conduct) throw new AppError('conduct_required', 'Please accept the code of conduct before your first booking', 403);
}

/** Cancels the unpaid booking started from a quote, if there is one, so its people are freed. */
async function dropPendingBooking(tx: Tx, ctx: Ctx, bookingId: string | null, reason: string) {
  if (!bookingId) return;
  const [b] = await tx.select({ id: bookings.id, status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)).limit(1).for('update');
  if (!b || b.status !== 'pending_payment') return;
  await tx.update(bookings).set({ status: 'cancelled', cancelledAt: sql`now()`, cancelledBy: 'system', cancelReason: reason }).where(eq(bookings.id, b.id));
  await tx.update(bookingAssignments).set({ status: 'released', releasedAt: sql`now()` })
    .where(and(eq(bookingAssignments.bookingId, b.id), eq(bookingAssignments.status, 'active')));
  await tx.insert(bookingEvents).values({ bookingId: b.id, fromStatus: 'pending_payment', toStatus: 'cancelled', actorUserId: ctx.userId, actorRole: 'system', data: { reason } });
}

// ---------- Expiry (sweep, and lazily before any read or action) ----------

/**
 * Sent quotes past their expiry become expired (unless a payment for them is still inside its
 * hold), which expires a request waiting on that quote. Open requests whose start time has passed
 * expire too. System scope. Idempotent.
 */
export async function applyRequestExpiry(tx: Tx, requestId?: string) {
  const only = requestId ? sql` and q.request_id = ${requestId}` : sql``;
  const expiredQuotes = await tx.execute<{ id: string; request_id: string }>(sql`
    update quotes q set status = 'expired'
    where q.status = 'sent' and q.expires_at < now() ${only}
      and not exists (select 1 from bookings b where b.id = q.booking_id and b.status = 'pending_payment' and b.hold_expires_at > now())
    returning q.id, q.request_id`);
  let requestsExpired = 0;
  for (const q of expiredQuotes) {
    const [r] = await tx.update(serviceRequests).set({ status: 'expired', closedReason: 'quote_expired' })
      .where(and(eq(serviceRequests.id, q.request_id), eq(serviceRequests.status, 'quoted'))).returning({ id: serviceRequests.id });
    if (r) {
      await recordEvent(tx, null, { requestId: r.id, from: 'quoted', to: 'expired', role: 'system', data: { reason: 'quote_expired', quoteId: q.id } });
      requestsExpired++;
    }
  }
  const late = await tx
    .select({ id: serviceRequests.id, status: serviceRequests.status })
    .from(serviceRequests)
    .where(and(inArray(serviceRequests.status, OPEN_REQUEST_STATUSES), lt(serviceRequests.startsAt, new Date()),
      requestId ? eq(serviceRequests.id, requestId) : undefined));
  for (const r of late) {
    await tx.update(quotes).set({ status: 'withdrawn' }).where(and(eq(quotes.requestId, r.id), eq(quotes.status, 'draft')));
    await tx.update(quotes).set({ status: 'expired' }).where(and(eq(quotes.requestId, r.id), eq(quotes.status, 'sent')));
    await tx.update(serviceRequests).set({ status: 'expired', closedReason: 'start_passed' }).where(eq(serviceRequests.id, r.id));
    await recordEvent(tx, null, { requestId: r.id, from: r.status, to: 'expired', role: 'system', data: { reason: 'start_passed' } });
    requestsExpired++;
  }
  return { quotesExpired: expiredQuotes.length, requestsExpired };
}

// ---------- Customer ----------

export const requestInput = z.object({
  serviceSlug: z.string().min(1).max(60),
  citySlug: z.string().min(1).max(60),
  zoneId: z.string().uuid('Pick an area'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a start time'),
  durationMinutes: z.coerce.number().int().positive(),
  workersNeeded: z.coerce.number().int().min(1, 'Ask for at least 1 person').max(50, 'Ask for up to 50 people'),
  answers: z.record(z.string(), z.union([z.string().max(300), z.number(), z.boolean()])).default({}),
  addressLine: z.string().trim().min(5, 'Enter the address').max(200),
  landmark: z.string().trim().max(100).optional(),
  details: z.string().trim().max(1000).default(''),
  budgetRupees: z.coerce.number().int().min(0).max(10_000_000).optional(),
});

export async function createServiceRequest(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, 'request.create');
  const input = requestInput.parse(raw);
  assertCleanAddress(input.addressLine, input.landmark);
  const scan = input.details ? scanText(input.details) : null;
  if (scan?.reasons.includes('prohibited_service')) throw invalid('request_blocked', explainBlock(scan.reasons), { field: 'details' });
  if (scan?.action === 'block') throw invalid('details_blocked', explainBlock(scan.reasons), { field: 'details' });
  await enforceRateLimit(`request:create:${ctx.userId}`, LIMITS.requestCreatePerUser);

  return withDb(ctx, async (tx) => {
    await requireConduct(tx, ctx);
    const s = await loadServiceInCity(tx, input.serviceSlug, input.citySlug);
    if (!s) throw notFound('Service');
    if (!requestsOpen(s)) throw conflict('not_offered', `${s.service.name} cannot be requested in ${s.city.name} yet`);
    if (s.service.config.customerVerification === 'id' && !(await hasVerifiedId(tx, ctx.userId!))) {
      throw conflict('customer_id_required', 'This service needs a verified ID. Add your ID in your account first.');
    }
    const [zone] = await tx.select({ id: zones.id }).from(zones).where(and(eq(zones.id, input.zoneId), eq(zones.cityId, s.city.id))).limit(1);
    if (!zone) throw invalid('invalid_zone', 'Pick an area in this city', { field: 'zoneId' });
    const max = s.service.config.workersRequired.max;
    if (input.workersNeeded > max) {
      throw invalid('too_many_people', `You can ask for up to ${max} ${max === 1 ? 'person' : 'people'} for ${s.service.name.toLowerCase()}`, { field: 'workersNeeded' });
    }
    // Ops need time to find people, so requests use the longer of the service's and the assisted notice period.
    const lead = await getConfig(tx, 'booking.lead_time_minutes');
    const slot = validateSlot({ ...s.service.config, leadTimeMinutes: Math.max(s.service.config.leadTimeMinutes, lead.assisted) }, input);
    const due = addBusinessMinutes(new Date(), await getConfig(tx, 'request.first_response_minutes'), await getConfig(tx, 'business_hours'));

    const [r] = await tx
      .insert(serviceRequests)
      .values({
        ref: requestRef(),
        customerUserId: ctx.userId!,
        serviceId: s.service.id,
        cityId: s.city.id,
        zoneId: zone.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        durationMinutes: input.durationMinutes,
        workersNeeded: input.workersNeeded,
        addressLine: input.addressLine,
        landmark: input.landmark || null,
        answers: slot.answers,
        details: input.details,
        budgetPaise: input.budgetRupees != null ? input.budgetRupees * 100 : null,
        status: 'submitted',
        firstResponseDueAt: due,
      })
      .returning({ id: serviceRequests.id, ref: serviceRequests.ref });
    await recordEvent(tx, ctx, { requestId: r!.id, from: null, to: 'submitted', role: 'customer', data: { workersNeeded: input.workersNeeded } });
    await asSystem(tx, ctx, async () => {
      if (scan?.action === 'review') {
        await tx.insert(moderationFlags).values({ entityType: 'service_request', entityId: r!.id, userId: ctx.userId, reasons: scan.reasons, severity: 'review' });
      }
      await enqueueNotification(tx, { channel: 'in_app', userId: ctx.userId!, template: 'request_received', payload: { ref: r!.ref }, idempotencyKey: `request:received:${r!.id}` });
    });
    await audit(tx, ctx, 'request.created', 'service_request', r!.id, { ref: r!.ref, service: s.service.slug, workersNeeded: input.workersNeeded });
    return { id: r!.id, ref: r!.ref, firstResponseDueAt: due };
  });
}

const latestSentQuote = sql<string | null>`(
  select q.status from quotes q where q.request_id = ${serviceRequests.id} and q.status <> 'draft' order by q.version desc limit 1)`;

export async function listMyRequests(ctx: Ctx) {
  requirePermission(ctx, 'request.create');
  return withDb(ctx, async (tx) => {
    await asSystem(tx, ctx, () => applyRequestExpiry(tx));
    return tx
      .select({
        id: serviceRequests.id, ref: serviceRequests.ref, status: serviceRequests.status, startsAt: serviceRequests.startsAt,
        endsAt: serviceRequests.endsAt, workersNeeded: serviceRequests.workersNeeded, serviceName: services.name,
        cityName: cities.name, zoneName: zones.name, quoteStatus: latestSentQuote, createdAt: serviceRequests.createdAt,
      })
      .from(serviceRequests)
      .innerJoin(services, eq(services.id, serviceRequests.serviceId))
      .innerJoin(cities, eq(cities.id, serviceRequests.cityId))
      .innerJoin(zones, eq(zones.id, serviceRequests.zoneId))
      .where(eq(serviceRequests.customerUserId, ctx.userId!))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(50);
  });
}

async function loadRequestView(tx: Tx, requestId: string, includeDrafts: boolean) {
  const [row] = await tx
    .select({ request: serviceRequests, serviceName: services.name, serviceSlug: services.slug, serviceConfig: services.config,
      riskTier: services.riskTier, cityName: cities.name, citySlug: cities.slug, zoneName: zones.name })
    .from(serviceRequests)
    .innerJoin(services, eq(services.id, serviceRequests.serviceId))
    .innerJoin(cities, eq(cities.id, serviceRequests.cityId))
    .innerJoin(zones, eq(zones.id, serviceRequests.zoneId))
    .where(eq(serviceRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  const r = row.request;
  const allQuotes = await tx.select().from(quotes).where(eq(quotes.requestId, r.id)).orderBy(desc(quotes.version));
  const visible = includeDrafts ? allQuotes : allQuotes.filter((q) => q.status !== 'draft');
  const events = await tx.select().from(serviceRequestEvents).where(eq(serviceRequestEvents.requestId, r.id)).orderBy(asc(serviceRequestEvents.at));
  const workerIds = [...new Set(visible.flatMap((q) => q.proposedWorkerIds))];
  const names = workerIds.length
    ? await tx.select({ id: workerProfiles.id, name: workerProfiles.displayName, ratingAvgX100: workerProfiles.ratingAvgX100, ratingCount: workerProfiles.ratingCount })
        .from(workerProfiles).where(inArray(workerProfiles.id, workerIds))
    : [];
  const bookingId = r.bookingId ?? visible.find((q) => q.status === 'sent' && q.bookingId)?.bookingId ?? null;
  const [booking] = bookingId
    ? await tx.select({ id: bookings.id, ref: bookings.ref, status: bookings.status, holdExpiresAt: bookings.holdExpiresAt })
        .from(bookings).where(eq(bookings.id, bookingId)).limit(1)
    : [];
  return {
    id: r.id,
    ref: r.ref,
    status: r.status,
    customerUserId: r.customerUserId,
    serviceName: row.serviceName,
    serviceSlug: row.serviceSlug,
    cityName: row.cityName,
    citySlug: row.citySlug,
    zoneName: row.zoneName,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    durationMinutes: r.durationMinutes,
    workersNeeded: r.workersNeeded,
    addressLine: r.addressLine,
    landmark: r.landmark,
    details: r.details,
    budgetPaise: r.budgetPaise,
    answersDisplay: row.serviceConfig.questions
      .filter((q) => r.answers[q.id] !== undefined && r.answers[q.id] !== '')
      .map((q) => ({ label: q.label, value: q.options?.find((o) => o.value === String(r.answers[q.id]))?.label ?? String(r.answers[q.id]) })),
    ownerUserId: r.ownerUserId,
    firstResponseDueAt: r.firstResponseDueAt,
    firstRespondedAt: r.firstRespondedAt,
    closedReason: r.closedReason,
    createdAt: r.createdAt,
    quotes: visible.map((q) => ({
      id: q.id,
      version: q.version,
      status: q.status,
      workersCount: q.workersCount,
      startsAt: q.startsAt,
      endsAt: q.endsAt,
      durationMinutes: q.durationMinutes,
      hourlyRatePaise: q.hourlyRatePaise,
      lines: q.priceSnapshot.customer.lines,
      totalPaise: q.totalPaise,
      perPersonNetPaise: q.priceSnapshot.worker.netPaise,
      messageToCustomer: q.messageToCustomer,
      customerNote: q.customerNote,
      expiresAt: q.expiresAt,
      sentAt: q.sentAt,
      proposed: q.proposedWorkerIds.map((id) => names.find((n) => n.id === id)).filter((n) => !!n),
      proposedWorkerIds: q.proposedWorkerIds,
    })),
    events: events.map((e) => ({ at: e.at, from: e.fromStatus, to: e.toStatus, by: e.actorRole, actorUserId: e.actorUserId, data: e.data })),
    booking: booking
      ? { ...booking, paymentOpen: booking.status === 'pending_payment' && !!booking.holdExpiresAt && booking.holdExpiresAt.getTime() > Date.now() }
      : null,
    responseOverdue: r.status === 'submitted' && r.firstResponseDueAt.getTime() < Date.now(),
  };
}

export type RequestView = NonNullable<Awaited<ReturnType<typeof loadRequestView>>>;

export async function getMyRequest(ctx: Ctx, requestId: string) {
  requirePermission(ctx, 'request.create');
  if (!UUID.test(requestId)) throw notFound('Request');
  return withDb(ctx, async (tx) => {
    await asSystem(tx, ctx, () => applyRequestExpiry(tx, requestId));
    const view = await loadRequestView(tx, requestId, false);
    if (!view || view.customerUserId !== ctx.userId) throw notFound('Request');
    return view;
  });
}

/** Loads a quote the customer owns, then re-reads and locks it in system scope for the change. */
async function lockCustomerQuote(tx: Tx, ctx: Ctx, quoteId: string) {
  if (!UUID.test(quoteId)) throw notFound('Quote');
  const [visible] = await tx
    .select({ id: quotes.id, requestId: quotes.requestId })
    .from(quotes)
    .innerJoin(serviceRequests, eq(serviceRequests.id, quotes.requestId))
    .where(and(eq(quotes.id, quoteId), eq(serviceRequests.customerUserId, ctx.userId!)))
    .limit(1);
  if (!visible) throw notFound('Quote');
  return asSystem(tx, ctx, async () => {
    await applyRequestExpiry(tx, visible.requestId);
    const [r] = await tx.select().from(serviceRequests).where(eq(serviceRequests.id, visible.requestId)).limit(1).for('update');
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1).for('update');
    if (!q || !r) throw notFound('Quote');
    if (q.status === 'expired') throw conflict('quote_expired', 'This quote has expired. Our team can send you a new one.');
    if (q.status !== 'sent' || r.status !== 'quoted') throw conflict('quote_not_open', 'This quote can no longer be changed');
    return { q, r };
  });
}

export async function respondToQuote(ctx: Ctx, input: { quoteId: string; action: 'change' | 'decline'; note?: string }) {
  requirePermission(ctx, 'request.create');
  const note = input.note?.trim().slice(0, 500) || null;
  if (input.action === 'change' && !note) throw invalid('note_required', 'Tell us what you would like changed', { field: 'note' });
  if (note && scanText(note).action === 'block') throw invalid('note_blocked', explainBlock(scanText(note).reasons), { field: 'note' });
  return withDb(ctx, async (tx) => {
    const { q, r } = await lockCustomerQuote(tx, ctx, input.quoteId);
    const to: RequestStatus = input.action === 'change' ? 'in_review' : 'declined';
    await asSystem(tx, ctx, async () => {
      await dropPendingBooking(tx, ctx, q.bookingId, input.action === 'change' ? 'Customer asked for a new quote' : 'Customer declined the quote');
      await tx.update(quotes).set({ status: input.action === 'change' ? 'change_requested' : 'declined', customerNote: note, respondedAt: new Date() }).where(eq(quotes.id, q.id));
      await tx.update(serviceRequests).set({ status: to, closedReason: input.action === 'decline' ? 'customer_declined' : null }).where(eq(serviceRequests.id, r.id));
      await recordEvent(tx, ctx, { requestId: r.id, from: 'quoted', to, role: 'customer', data: { quoteId: q.id, version: q.version, note } });
      if (r.ownerUserId) {
        await enqueueNotification(tx, { channel: 'in_app', userId: r.ownerUserId, template: input.action === 'change' ? 'quote_change_requested' : 'quote_declined',
          payload: { ref: r.ref }, idempotencyKey: `quote:${input.action}:${q.id}` });
      }
    });
    await audit(tx, ctx, input.action === 'change' ? 'quote.change_requested' : 'quote.declined', 'quote', q.id, { requestId: r.id });
    return { status: to };
  });
}

export async function cancelMyRequest(ctx: Ctx, input: { requestId: string; reason: string }) {
  requirePermission(ctx, 'request.create');
  return cancelRequest(ctx, input, 'customer');
}

async function cancelRequest(ctx: Ctx, input: { requestId: string; reason: string }, role: 'customer' | 'staff') {
  const reason = input.reason.trim().slice(0, 300);
  if (!reason) throw invalid('reason_required', 'Tell us why you are cancelling', { field: 'reason' });
  if (!UUID.test(input.requestId)) throw notFound('Request');
  return withDb(ctx, async (tx) => {
    const [visible] = await tx.select({ id: serviceRequests.id, customer: serviceRequests.customerUserId }).from(serviceRequests)
      .where(eq(serviceRequests.id, input.requestId)).limit(1);
    if (!visible || (role === 'customer' && visible.customer !== ctx.userId)) throw notFound('Request');
    await asSystem(tx, ctx, async () => {
      await applyRequestExpiry(tx, visible.id);
      const [r] = await tx.select().from(serviceRequests).where(eq(serviceRequests.id, visible.id)).limit(1).for('update');
      if (!r || !OPEN_REQUEST_STATUSES.includes(r.status)) throw conflict('request_closed', 'This request is already closed');
      const open = await tx.update(quotes).set({ status: 'withdrawn' })
        .where(and(eq(quotes.requestId, r.id), inArray(quotes.status, ['draft', 'sent']))).returning({ bookingId: quotes.bookingId });
      for (const q of open) await dropPendingBooking(tx, ctx, q.bookingId, 'Request cancelled');
      await tx.update(serviceRequests).set({ status: 'cancelled', closedReason: reason }).where(eq(serviceRequests.id, r.id));
      await recordEvent(tx, ctx, { requestId: r.id, from: r.status, to: 'cancelled', role, data: { reason } });
    });
    await audit(tx, ctx, 'request.cancelled', 'service_request', visible.id, { by: role, reason });
  });
}

/**
 * Accept and pay: creates a pending booking at the quote's exact price snapshot, with the
 * proposed people who are still free assigned (anyone no longer free leaves an empty place that
 * ops refill). The quote and request become accepted when the payment is captured.
 */
export async function acceptQuote(ctx: Ctx, quoteId: string) {
  requirePermission(ctx, 'booking.create');
  await enforceRateLimit(`booking:create:${ctx.userId}`, LIMITS.bookingCreatePerUser);
  return withDb(ctx, async (tx) => {
    await requireConduct(tx, ctx);
    const { q, r } = await lockCustomerQuote(tx, ctx, quoteId);
    const s = await loadServiceInCity(tx, q.priceSnapshot.serviceSlug, q.priceSnapshot.citySlug);
    if (!s || !requestsOpen(s)) throw conflict('not_offered', 'This service is not available right now. Contact our team.');
    if (s.service.config.customerVerification === 'id' && !(await hasVerifiedId(tx, ctx.userId!))) {
      throw conflict('customer_id_required', 'This service needs a verified ID. Add your ID in your account first.');
    }
    if (q.startsAt.getTime() < Date.now() + 60 * 60_000) throw conflict('too_late', 'This job starts too soon to book online. Contact our team.');

    // A second click while the first payment is still open goes back to that payment.
    if (q.bookingId) {
      const [prev] = await tx.select().from(bookings).where(eq(bookings.id, q.bookingId)).limit(1);
      if (prev?.status === 'pending_payment' && prev.holdExpiresAt && prev.holdExpiresAt.getTime() > Date.now()) {
        return { bookingId: prev.id, ref: prev.ref, totalPaise: prev.totalPaise, holdExpiresAt: prev.holdExpiresAt, assigned: null };
      }
    }

    const holdMinutes = await getConfig(tx, 'booking.payment_hold_minutes', { citySlug: s.city.slug, serviceSlug: s.service.slug });
    const [booking] = await tx
      .insert(bookings)
      .values({
        ref: bookingRef(),
        customerUserId: ctx.userId!,
        serviceId: r.serviceId,
        cityId: r.cityId,
        zoneId: r.zoneId,
        status: 'pending_payment',
        startsAt: q.startsAt,
        endsAt: q.endsAt,
        addressLine: r.addressLine,
        landmark: r.landmark,
        answers: r.answers,
        priceSnapshot: q.priceSnapshot,
        totalPaise: q.totalPaise,
        pricingVersion: q.pricingVersion,
        workersNeeded: q.workersCount,
        holdExpiresAt: sql`now() + make_interval(mins => ${holdMinutes})`,
      })
      .returning();
    if (!booking) throw new Error('booking insert failed');

    const assigned: string[] = [];
    await asSystem(tx, ctx, async () => {
      for (const workerId of q.proposedWorkerIds) {
        if ((await tryAssign(tx, booking, workerId)) === 'assigned') assigned.push(workerId);
      }
      await tx.update(quotes).set({ bookingId: booking.id }).where(eq(quotes.id, q.id));
    });
    await tx.insert(bookingEvents).values({
      bookingId: booking.id, toStatus: 'pending_payment', actorUserId: ctx.userId, actorRole: 'customer',
      data: { quoteId: q.id, requestId: r.id, assigned: assigned.length, needed: q.workersCount, totalPaise: booking.totalPaise },
    });
    const payment = await openPaymentOrder(tx, booking);
    await audit(tx, ctx, 'quote.accept_started', 'quote', q.id, { bookingId: booking.id, assigned: assigned.length, needed: q.workersCount });
    return { bookingId: booking.id, ref: booking.ref, totalPaise: booking.totalPaise, holdExpiresAt: booking.holdExpiresAt, assigned: assigned.length, payment };
  });
}

// ---------- Ops ----------

export type OpsView = 'open' | 'unanswered' | 'mine' | 'all';

export async function listRequestsForOps(ctx: Ctx, opts: { view?: OpsView; page?: number } = {}) {
  requirePermission(ctx, 'request.manage');
  const view = opts.view ?? 'open';
  const page = Math.max(1, opts.page ?? 1);
  return withDb(ctx, async (tx) => {
    await asSystem(tx, ctx, () => applyRequestExpiry(tx));
    const owner = sql<string | null>`(select u.display_name from users u where u.id = ${serviceRequests.ownerUserId})`;
    const conds = [];
    if (view === 'open' || view === 'mine') conds.push(inArray(serviceRequests.status, OPEN_REQUEST_STATUSES));
    if (view === 'unanswered') conds.push(eq(serviceRequests.status, 'submitted'));
    if (view === 'mine') conds.push(eq(serviceRequests.ownerUserId, ctx.userId!));
    const rows = await tx
      .select({
        id: serviceRequests.id, ref: serviceRequests.ref, status: serviceRequests.status, startsAt: serviceRequests.startsAt,
        workersNeeded: serviceRequests.workersNeeded, serviceName: services.name, cityName: cities.name, zoneName: zones.name,
        ownerName: owner, firstResponseDueAt: serviceRequests.firstResponseDueAt, firstRespondedAt: serviceRequests.firstRespondedAt,
        quoteStatus: latestSentQuote, createdAt: serviceRequests.createdAt,
      })
      .from(serviceRequests)
      .innerJoin(services, eq(services.id, serviceRequests.serviceId))
      .innerJoin(cities, eq(cities.id, serviceRequests.cityId))
      .innerJoin(zones, eq(zones.id, serviceRequests.zoneId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(view === 'all' ? desc(serviceRequests.createdAt) : asc(serviceRequests.firstResponseDueAt))
      .limit(26)
      .offset((page - 1) * 25);
    const now = Date.now();
    return {
      rows: rows.slice(0, 25).map((r) => ({ ...r, overdue: r.status === 'submitted' && r.firstResponseDueAt.getTime() < now })),
      hasNext: rows.length > 25,
      page,
    };
  });
}

/** Counts for the ops overview. */
export async function requestCounts(ctx: Ctx) {
  requirePermission(ctx, 'request.manage');
  return withDb(ctx, async (tx) => {
    const [c] = await tx.execute<{ open: number; unanswered: number; overdue: number }>(sql`
      select count(*) filter (where status in ('submitted','in_review','sourcing','quoted'))::int as open,
             count(*) filter (where status = 'submitted')::int as unanswered,
             count(*) filter (where status = 'submitted' and first_response_due_at < now())::int as overdue
      from service_requests`);
    return { open: Number(c?.open ?? 0), unanswered: Number(c?.unanswered ?? 0), overdue: Number(c?.overdue ?? 0) };
  });
}

export async function getRequestForOps(ctx: Ctx, requestId: string) {
  requirePermission(ctx, 'request.manage');
  if (!UUID.test(requestId)) throw notFound('Request');
  return withDb(ctx, async (tx) => {
    await asSystem(tx, ctx, () => applyRequestExpiry(tx, requestId));
    const view = await loadRequestView(tx, requestId, true);
    if (!view) throw notFound('Request');
    const [customer] = await tx.select({ name: users.displayName, phone: users.phoneE164 }).from(users).where(eq(users.id, view.customerUserId)).limit(1);
    const actorIds = [...new Set([view.ownerUserId, ...view.events.map((e) => e.actorUserId)].filter((v): v is string => !!v))];
    const actors = actorIds.length ? await tx.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, actorIds)) : [];
    const s = await loadServiceInCity(tx, view.serviceSlug, view.citySlug);
    const [assigned] = view.booking
      ? await tx.execute<{ n: number }>(sql`select count(*)::int as n from booking_assignments where booking_id = ${view.booking.id} and status = 'active'`)
      : [];
    return {
      ...view,
      customer: { name: customer?.name ?? 'Customer', phoneE164: customer?.phone ?? '' },
      ownerName: actors.find((a) => a.id === view.ownerUserId)?.name ?? null,
      actorNames: Object.fromEntries(actors.map((a) => [a.id, a.name ?? 'Staff'])),
      defaultHourlyRatePaise: s?.serviceCity.pricing.hourlyRatePaise ?? 0,
      durationLimits: s?.service.config.durationMinutes ?? null,
      maxPeople: s?.service.config.workersRequired.max ?? 1,
      bookingAssigned: assigned ? Number(assigned.n) : null,
    };
  });
}

async function lockRequestForStaff(tx: Tx, ctx: Ctx, requestId: string) {
  if (!UUID.test(requestId)) throw notFound('Request');
  await asSystem(tx, ctx, () => applyRequestExpiry(tx, requestId));
  const [r] = await tx.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1).for('update');
  if (!r) throw notFound('Request');
  return r;
}

/** Ops takes ownership. A new request moves to in review, which counts as the first response. */
export async function claimRequest(ctx: Ctx, requestId: string) {
  requirePermission(ctx, 'request.manage');
  return withDb(ctx, async (tx) => {
    const r = await lockRequestForStaff(tx, ctx, requestId);
    if (!OPEN_REQUEST_STATUSES.includes(r.status)) throw conflict('request_closed', 'This request is closed');
    const to: RequestStatus = r.status === 'submitted' ? 'in_review' : r.status;
    await tx.update(serviceRequests).set({ ownerUserId: ctx.userId, status: to, firstRespondedAt: r.firstRespondedAt ?? new Date() }).where(eq(serviceRequests.id, r.id));
    await recordEvent(tx, ctx, { requestId: r.id, from: r.status, to, role: 'staff', data: { owner: ctx.userId, previousOwner: r.ownerUserId } });
    await audit(tx, ctx, 'request.claimed', 'service_request', r.id, { previousOwner: r.ownerUserId });
  });
}

/** Ops marks the request as being worked on: in review, or sourcing (contacting people). */
export async function setRequestStage(ctx: Ctx, input: { requestId: string; to: 'in_review' | 'sourcing' }) {
  requirePermission(ctx, 'request.manage');
  return withDb(ctx, async (tx) => {
    const r = await lockRequestForStaff(tx, ctx, input.requestId);
    if (!['submitted', 'in_review', 'sourcing'].includes(r.status) || r.status === input.to) {
      throw conflict('invalid_transition', `A ${r.status.replace('_', ' ')} request cannot move to ${input.to.replace('_', ' ')}`);
    }
    await tx.update(serviceRequests).set({ status: input.to, ownerUserId: r.ownerUserId ?? ctx.userId, firstRespondedAt: r.firstRespondedAt ?? new Date() })
      .where(eq(serviceRequests.id, r.id));
    await recordEvent(tx, ctx, { requestId: r.id, from: r.status, to: input.to, role: 'staff', data: r.ownerUserId ? {} : { owner: ctx.userId } });
    await audit(tx, ctx, `request.${input.to}`, 'service_request', r.id);
  });
}

export async function cancelRequestAsStaff(ctx: Ctx, input: { requestId: string; reason: string }) {
  requirePermission(ctx, 'request.manage');
  return cancelRequest(ctx, input, 'staff');
}

/** An expired request the customer still wants goes back into review, if it has not started. */
export async function reopenRequest(ctx: Ctx, requestId: string) {
  requirePermission(ctx, 'request.manage');
  return withDb(ctx, async (tx) => {
    const r = await lockRequestForStaff(tx, ctx, requestId);
    if (r.status !== 'expired') throw conflict('invalid_transition', 'Only expired requests can be reopened');
    if (r.startsAt.getTime() < Date.now() + 60 * 60_000) throw conflict('too_late', 'This job starts too soon to reopen');
    await tx.update(serviceRequests).set({ status: 'in_review', closedReason: null, ownerUserId: r.ownerUserId ?? ctx.userId }).where(eq(serviceRequests.id, r.id));
    await recordEvent(tx, ctx, { requestId: r.id, from: 'expired', to: 'in_review', role: 'staff', data: { reopened: true } });
    await audit(tx, ctx, 'request.reopened', 'service_request', r.id);
  });
}

async function eligibilityFor(tx: Tx, r: typeof serviceRequests.$inferSelect, config: ServiceInCity['service']['config'], extra: { workerId?: string; limit: number }) {
  const [customer] = await tx.select({ gender: users.gender }).from(users).where(eq(users.id, r.customerUserId)).limit(1);
  return findEligibleWorkers(tx, {
    serviceId: r.serviceId, config, cityId: r.cityId, zoneId: r.zoneId, startsAt: r.startsAt, endsAt: r.endsAt,
    answers: r.answers, customerGender: customer?.gender ?? null, ...extra,
  });
}

/** Verified people who serve the area and are free for the whole slot (the same rules as search). */
export async function suggestWorkersForRequest(ctx: Ctx, requestId: string) {
  requirePermission(ctx, 'request.manage');
  if (!UUID.test(requestId)) throw notFound('Request');
  return withDb(ctx, async (tx) => {
    const [r] = await tx.select().from(serviceRequests).where(eq(serviceRequests.id, requestId)).limit(1);
    if (!r) throw notFound('Request');
    const [svc] = await tx.select({ slug: services.slug }).from(services).where(eq(services.id, r.serviceId));
    const [city] = await tx.select({ slug: cities.slug }).from(cities).where(eq(cities.id, r.cityId));
    const s = await loadServiceInCity(tx, svc!.slug, city!.slug);
    return asSystem(tx, ctx, () => eligibilityFor(tx, r, s!.service.config, { limit: 60 }));
  });
}

export const quoteDraftInput = z.object({
  requestId: z.string().uuid(),
  workersCount: z.coerce.number().int().min(1).max(50),
  durationMinutes: z.coerce.number().int().positive(),
  hourlyRateRupees: z.coerce.number().int('Use whole rupees').min(1, 'Enter a price per hour').max(100_000),
  proposedWorkerIds: z.array(z.string().uuid()).max(50).default([]),
  messageToCustomer: z.string().trim().max(500).optional(),
});

/** Creates or updates the request's draft quote. Customers do not see drafts. */
export async function saveQuoteDraft(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, 'request.manage');
  const input = quoteDraftInput.parse(raw);
  const proposed = [...new Set(input.proposedWorkerIds)];
  if (proposed.length > input.workersCount) throw invalid('too_many_proposed', 'Pick no more people than the quote is for', { field: 'proposedWorkerIds' });
  if (input.messageToCustomer && scanText(input.messageToCustomer).action === 'block') {
    throw invalid('message_blocked', explainBlock(scanText(input.messageToCustomer).reasons), { field: 'messageToCustomer' });
  }
  return withDb(ctx, async (tx) => {
    const r = await lockRequestForStaff(tx, ctx, input.requestId);
    if (!['submitted', 'in_review', 'sourcing'].includes(r.status)) {
      throw conflict(r.status === 'quoted' ? 'quote_pending' : 'request_closed',
        r.status === 'quoted' ? 'A quote is waiting for the customer. Withdraw it before drafting another.' : 'This request is closed');
    }
    const [svc] = await tx.select({ slug: services.slug }).from(services).where(eq(services.id, r.serviceId));
    const [city] = await tx.select({ slug: cities.slug }).from(cities).where(eq(cities.id, r.cityId));
    const s = (await loadServiceInCity(tx, svc!.slug, city!.slug))!;
    if (input.workersCount > s.service.config.workersRequired.max) {
      throw invalid('too_many_people', `Up to ${s.service.config.workersRequired.max} people for this service`, { field: 'workersCount' });
    }
    // Same start; the length may change. Notice period is not re-checked: the customer already chose this time.
    const p = istParts(r.startsAt);
    const slot = validateSlot({ ...s.service.config, leadTimeMinutes: 0 }, {
      serviceSlug: svc!.slug, citySlug: city!.slug, zoneId: r.zoneId, date: p.date, time: minutesToHhmm(p.minuteOfDay),
      durationMinutes: input.durationMinutes, answers: r.answers,
    });
    for (const workerId of proposed) {
      const ok = await asSystem(tx, ctx, () => eligibilityFor(tx, { ...r, endsAt: slot.endsAt }, s.service.config, { workerId, limit: 1 }));
      if (!ok.length) throw invalid('worker_not_available', 'Someone you picked is not free, not approved for this service, or does not work in this area', { field: 'proposedWorkerIds' });
    }
    const snapshot = computePrice({
      pricing: { ...s.serviceCity.pricing, model: 'hourly', hourlyRatePaise: input.hourlyRateRupees * 100 },
      pricingVersion: s.serviceCity.pricingVersion,
      durationMinutes: input.durationMinutes,
      serviceSlug: s.service.slug,
      citySlug: s.city.slug,
      serviceLabel: s.service.name,
      workersCount: input.workersCount,
    });
    const values = {
      workersCount: input.workersCount,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      durationMinutes: input.durationMinutes,
      hourlyRatePaise: input.hourlyRateRupees * 100,
      priceSnapshot: snapshot,
      totalPaise: snapshot.customer.totalPaise,
      pricingVersion: s.serviceCity.pricingVersion,
      proposedWorkerIds: proposed,
      messageToCustomer: input.messageToCustomer || null,
    };
    const [draft] = await tx.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.requestId, r.id), eq(quotes.status, 'draft'))).limit(1);
    let id: string;
    if (draft) {
      await tx.update(quotes).set(values).where(eq(quotes.id, draft.id));
      id = draft.id;
    } else {
      const [next] = await tx.execute<{ v: number }>(sql`select coalesce(max(version), 0)::int + 1 as v from quotes where request_id = ${r.id}`);
      const [row] = await tx.insert(quotes).values({ ...values, requestId: r.id, version: Number(next?.v ?? 1), status: 'draft', createdBy: ctx.userId! }).returning({ id: quotes.id });
      id = row!.id;
    }
    if (r.status === 'submitted') {
      await tx.update(serviceRequests).set({ status: 'in_review', ownerUserId: r.ownerUserId ?? ctx.userId, firstRespondedAt: r.firstRespondedAt ?? new Date() })
        .where(eq(serviceRequests.id, r.id));
      await recordEvent(tx, ctx, { requestId: r.id, from: 'submitted', to: 'in_review', role: 'staff', data: { owner: r.ownerUserId ?? ctx.userId } });
    }
    await audit(tx, ctx, 'quote.drafted', 'quote', id, { requestId: r.id, totalPaise: snapshot.customer.totalPaise, workersCount: input.workersCount });
    return { id, totalPaise: snapshot.customer.totalPaise };
  });
}

/** Sends the draft. It stays valid for 48 hours (config), and never past an hour before the start. */
export async function sendQuote(ctx: Ctx, quoteId: string) {
  requirePermission(ctx, 'request.manage');
  if (!UUID.test(quoteId)) throw notFound('Quote');
  return withDb(ctx, async (tx) => {
    const [found] = await tx.select({ requestId: quotes.requestId }).from(quotes).where(eq(quotes.id, quoteId)).limit(1);
    if (!found) throw notFound('Quote');
    const r = await lockRequestForStaff(tx, ctx, found.requestId);
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).limit(1).for('update');
    if (!q || q.status !== 'draft') throw conflict('quote_not_draft', 'Only a draft can be sent');
    if (!['submitted', 'in_review', 'sourcing'].includes(r.status)) throw conflict('request_closed', 'This request is closed');
    const validity = await getConfig(tx, 'quote.validity_hours');
    const expiresAt = new Date(Math.min(Date.now() + validity * 3_600_000, q.startsAt.getTime() - 60 * 60_000));
    if (expiresAt.getTime() < Date.now() + 15 * 60_000) throw conflict('too_late', 'This job starts too soon for the customer to accept a quote online');
    await tx.update(quotes).set({ status: 'sent', sentAt: new Date(), expiresAt }).where(eq(quotes.id, q.id));
    await tx.update(serviceRequests).set({ status: 'quoted', ownerUserId: r.ownerUserId ?? ctx.userId, firstRespondedAt: r.firstRespondedAt ?? new Date() })
      .where(eq(serviceRequests.id, r.id));
    await recordEvent(tx, ctx, { requestId: r.id, from: r.status, to: 'quoted', role: 'staff', data: { quoteId: q.id, version: q.version, totalPaise: q.totalPaise } });
    await asSystem(tx, ctx, () =>
      enqueueNotification(tx, { channel: 'sms', userId: r.customerUserId, template: 'quote_sent', payload: { ref: r.ref }, idempotencyKey: `quote:sent:${q.id}` }),
    );
    await audit(tx, ctx, 'quote.sent', 'quote', q.id, { requestId: r.id, totalPaise: q.totalPaise, expiresAt: expiresAt.toISOString() });
    return { expiresAt };
  });
}

/** Ops takes back a draft or a sent quote (for example to correct it). A sent one returns the request to review. */
export async function withdrawQuote(ctx: Ctx, input: { quoteId: string; reason: string }) {
  requirePermission(ctx, 'request.manage');
  const reason = input.reason.trim().slice(0, 300);
  if (!reason) throw invalid('reason_required', 'Add a reason', { field: 'reason' });
  if (!UUID.test(input.quoteId)) throw notFound('Quote');
  return withDb(ctx, async (tx) => {
    const [found] = await tx.select({ requestId: quotes.requestId }).from(quotes).where(eq(quotes.id, input.quoteId)).limit(1);
    if (!found) throw notFound('Quote');
    const r = await lockRequestForStaff(tx, ctx, found.requestId);
    const [q] = await tx.select().from(quotes).where(eq(quotes.id, input.quoteId)).limit(1).for('update');
    if (!q || (q.status !== 'draft' && q.status !== 'sent')) throw conflict('quote_closed', 'This quote is already closed');
    await asSystem(tx, ctx, () => dropPendingBooking(tx, ctx, q.bookingId, 'Quote withdrawn'));
    await tx.update(quotes).set({ status: 'withdrawn' }).where(eq(quotes.id, q.id));
    if (q.status === 'sent' && r.status === 'quoted') {
      await tx.update(serviceRequests).set({ status: 'in_review' }).where(eq(serviceRequests.id, r.id));
      await recordEvent(tx, ctx, { requestId: r.id, from: 'quoted', to: 'in_review', role: 'staff', data: { quoteId: q.id, withdrawn: reason } });
    }
    await audit(tx, ctx, 'quote.withdrawn', 'quote', q.id, { requestId: r.id, reason });
  });
}
