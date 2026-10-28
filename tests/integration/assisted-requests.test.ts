/**
 * Milestone 2 exit criteria: a request moves through every status with audit history; an
 * accepted quote becomes a confirmed multi-worker booking; partial fill is visible to ops;
 * quote expiry and multi-worker overlaps are enforced.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  acceptQuote,
  applyRequestExpiry,
  cancelMyRequest,
  claimRequest,
  createServiceRequest,
  getMyRequest,
  getRequestForOps,
  listRequestsForOps,
  reopenRequest,
  respondToQuote,
  saveQuoteDraft,
  sendQuote,
  setRequestStage,
  suggestWorkersForRequest,
  withdrawQuote,
} from '@/modules/requests/assisted';
import { serviceRequests, quotes } from '@/modules/requests/schema';
import { cancelBooking, createBooking, finishJob, getBookingForViewer, listBookingsForAdmin, startJob } from '@/modules/bookings/service';
import { assignWorkerToBooking } from '@/modules/bookings/team';
import { payWithSandbox } from '@/modules/payments/service';
import { rateBooking } from '@/modules/reviews/service';
import { DRIVER_PRICING } from '@/modules/catalog/seed';
import { serviceCities, services } from '@/modules/catalog/schema';
import { workerDocuments, workerProfiles, workerServiceApprovals, workerWeeklyHours, workerZones } from '@/modules/workers/schema';
import { systemCtx, withDb, type Ctx } from '@/platform/db/client';
import { createTestCity, createUser, ensureSeed, ownerSql, slot, staffCtx } from '../helpers/fixtures';

const STAFF_RATE = 30000;

/** A test city with event staff live (threshold 1). */
async function eventStaffCity() {
  const t = await createTestCity({ threshold: 1 });
  await withDb(systemCtx(), async (tx) => {
    const [svc] = await tx.select().from(services).where(eq(services.slug, 'event-staff'));
    await tx.insert(serviceCities).values({ serviceId: svc!.id, cityId: t.city.id, status: 'live', pricing: { ...DRIVER_PRICING, hourlyRatePaise: STAFF_RATE }, goLiveMinWorkers: 1 });
  });
  return t;
}

/** A verified event staff worker serving one zone, working 06:00 to 23:00 every day. */
async function staffWorker(zoneId: string) {
  const { user } = await createUser(['worker'], { conduct: true });
  return withDb(systemCtx(), async (tx) => {
    const [svc] = await tx.select().from(services).where(eq(services.slug, 'event-staff'));
    const [wp] = await tx
      .insert(workerProfiles)
      .values({ userId: user.id, displayName: `Host ${user.id.slice(0, 4)}`, languages: ['Hindi'], gender: 'female', yearsExperience: 3,
        status: 'active', kycStatus: 'verified', kycProviderRef: 'manual:test', photoStatus: 'approved' })
      .returning();
    const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
    await tx.insert(workerDocuments).values([
      { workerId: wp!.id, docType: 'police_certificate', status: 'approved', issuedOn: new Date().toISOString().slice(0, 10), expiresOn: nextYear },
      { workerId: wp!.id, docType: 'id_proof', status: 'approved', numberMasked: 'XXXX-XXXX-1111' },
    ]);
    await tx.insert(workerServiceApprovals).values({ workerId: wp!.id, serviceId: svc!.id, status: 'approved' });
    await tx.insert(workerZones).values({ workerId: wp!.id, zoneId });
    await tx.insert(workerWeeklyHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ workerId: wp!.id, weekday, startMinute: 360, endMinute: 1380 })));
    const ctx: Ctx = { userId: user.id, roles: ['worker'], requestId: 'w' };
    return { id: wp!.id, ctx };
  });
}

function requestFor(t: Awaited<ReturnType<typeof eventStaffCity>>, people: number, days = 3) {
  return {
    serviceSlug: 'event-staff', citySlug: t.city.slug, zoneId: t.zone.id, ...slot(days, '10:00'), durationMinutes: 240,
    workersNeeded: people, answers: { role: 'host' }, addressLine: 'Hall 2, Test Expo Centre', details: 'Hosts for a product launch',
  };
}

/** Moves a sent quote's expiry into the past, bypassing the quote guard as only a test may. */
async function expireQuoteNow(quoteId: string) {
  const sql = ownerSql();
  try {
    await sql.begin(async (t) => {
      await t`set local session_replication_role = replica`;
      await t`update quotes set expires_at = now() - interval '1 minute' where id = ${quoteId}`;
    });
  } finally {
    await sql.end();
  }
}

describe('assisted requests and quotes', () => {
  beforeAll(ensureSeed);

  it('runs from request to a confirmed team booking, with partial fill, full team, completion and ratings', async () => {
    const t = await eventStaffCity();
    const [w1, w2, w3] = [await staffWorker(t.zone.id), await staffWorker(t.zone.id), await staffWorker(t.zone.id)];
    const { ctx: customer } = await createUser(['customer']);
    const ops = await staffCtx(['ops']);

    const req = await createServiceRequest(customer, { ...requestFor(t, 3), budgetRupees: 4000 });
    expect(req.ref).toMatch(/^RQ-/);
    expect(req.firstResponseDueAt.getTime()).toBeGreaterThan(Date.now());
    expect((await listRequestsForOps(ops, { view: 'unanswered' })).rows.map((r) => r.id)).toContain(req.id);

    await claimRequest(ops, req.id);
    await setRequestStage(ops, { requestId: req.id, to: 'sourcing' });
    const suggested = (await suggestWorkersForRequest(ops, req.id)).map((w) => w.id);
    expect(suggested).toEqual(expect.arrayContaining([w1.id, w2.id, w3.id]));

    const d1 = await saveQuoteDraft(ops, { requestId: req.id, workersCount: 3, durationMinutes: 240, hourlyRateRupees: 300, proposedWorkerIds: [w1.id, w2.id] });
    expect(d1.totalPaise).toBe(300 * 100 * 4 * 3);
    expect((await getMyRequest(customer, req.id)).quotes).toEqual([]); // drafts are never shown
    await sendQuote(ops, d1.id);
    await respondToQuote(customer, { quoteId: d1.id, action: 'change', note: 'Could you do 280 an hour?' });
    const d2 = await saveQuoteDraft(ops, { requestId: req.id, workersCount: 3, durationMinutes: 240, hourlyRateRupees: 280, proposedWorkerIds: [w1.id, w2.id],
      messageToCustomer: 'Two hosts confirmed; we are confirming the third.' });
    await sendQuote(ops, d2.id);
    const quoted = await getMyRequest(customer, req.id);
    expect(quoted.status).toBe('quoted');
    expect(quoted.quotes.map((q) => [q.version, q.status])).toEqual([[2, 'sent'], [1, 'change_requested']]);
    expect(quoted.quotes[0]!.proposed.map((p) => p.id)).toEqual([w1.id, w2.id]);

    const accepted = await acceptQuote(customer, d2.id);
    expect(accepted.assigned).toBe(2);
    // A second click returns the same unpaid booking instead of making another.
    expect((await acceptQuote(customer, d2.id)).bookingId).toBe(accepted.bookingId);
    await payWithSandbox(customer, accepted.bookingId);

    const booking = await getBookingForViewer(customer, accepted.bookingId);
    expect(booking).toMatchObject({ status: 'confirmed', workersNeeded: 3, totalPaise: 280 * 100 * 4 * 3 });
    expect(booking.workers.map((w) => w.id)).toEqual([w1.id, w2.id]);
    const after = await getMyRequest(customer, req.id);
    expect(after.status).toBe('accepted');
    expect(after.quotes[0]!.status).toBe('accepted');

    // Partial fill is visible to ops, and the job cannot start until everyone is there.
    const partial = await listBookingsForAdmin(ops, { needsPeople: true });
    expect(partial.rows.find((r) => r.id === accepted.bookingId)).toMatchObject({ assigned: 2, workersNeeded: 3 });
    const code = booking.codes.start!;
    await expect(startJob(w1.ctx, accepted.bookingId, code)).rejects.toMatchObject({ code: 'team_incomplete' });
    await expect(assignWorkerToBooking(ops, { bookingId: accepted.bookingId, workerId: w1.id })).rejects.toMatchObject({ code: 'already_on_team' });
    await assignWorkerToBooking(ops, { bookingId: accepted.bookingId, workerId: w3.id });
    await expect(assignWorkerToBooking(ops, { bookingId: accepted.bookingId, workerId: w3.id })).rejects.toMatchObject({ code: 'already_on_team' });
    expect((await listBookingsForAdmin(ops, { needsPeople: true })).rows.some((r) => r.id === accepted.bookingId)).toBe(false);

    const sql = ownerSql();
    try {
      await sql`update bookings set starts_at = now() + interval '10 minutes' where id = ${accepted.bookingId}`;
      await startJob(w2.ctx, accepted.bookingId, code);
      const endCode = (await getBookingForViewer(customer, accepted.bookingId)).codes.end!;
      await finishJob(w3.ctx, accepted.bookingId, endCode);

      // Each person is paid the same per-person net, and the journal balances.
      const lines = await sql`
        select la.owner_id, ll.credit_paise::int as credit from ledger_lines ll
        join journal_entries j on j.id = ll.journal_id join ledger_accounts la on la.id = ll.account_id
        where j.booking_id = ${accepted.bookingId} and j.kind = 'completion' and la.code = 'worker_payable'`;
      const perPerson = 280 * 100 * 4 - 22400 - 4032;
      expect(lines.map((l) => l.owner_id).sort()).toEqual([w1.id, w2.id, w3.id].sort());
      expect(lines.every((l) => l.credit === perPerson)).toBe(true);

      // Every status the request passed through is recorded, by whom, and audited.
      const events = await sql`select to_status, actor_role from service_request_events where request_id = ${req.id} order by at, id`;
      expect(events.map((e) => e.to_status)).toEqual(['submitted', 'in_review', 'sourcing', 'quoted', 'in_review', 'quoted', 'accepted']);
      expect(events.map((e) => e.actor_role)).toEqual(['customer', 'staff', 'staff', 'staff', 'customer', 'staff', 'system']);
      const audits = await sql`select action from audit_log where entity_id in (${req.id}, ${d1.id}, ${d2.id})`;
      expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['request.created', 'request.claimed', 'request.sourcing', 'quote.drafted', 'quote.sent', 'quote.change_requested', 'quote.accept_started']));
    } finally {
      await sql.end();
    }

    // The customer rates each person once.
    await rateBooking(customer, accepted.bookingId, { score: 5, workerId: w1.id });
    await rateBooking(customer, accepted.bookingId, { score: 4, workerId: w2.id });
    await expect(rateBooking(customer, accepted.bookingId, { score: 3, workerId: w1.id })).rejects.toMatchObject({ code: 'already_rated' });
    await expect(rateBooking(customer, accepted.bookingId, { score: 3 })).rejects.toMatchObject({ code: 'not_found' });
    await rateBooking(w3.ctx, accepted.bookingId, { score: 5 });
  });

  it('expires a quote after its validity, refuses it, and lets ops reopen the request', async () => {
    const t = await eventStaffCity();
    const w = await staffWorker(t.zone.id);
    const { ctx: customer } = await createUser(['customer']);
    const ops = await staffCtx(['ops']);
    const req = await createServiceRequest(customer, requestFor(t, 1));
    const q = await saveQuoteDraft(ops, { requestId: req.id, workersCount: 1, durationMinutes: 240, hourlyRateRupees: 300, proposedWorkerIds: [w.id] });
    const sent = await sendQuote(ops, q.id);
    expect(sent.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 48 * 3_600_000 + 1000);

    await expireQuoteNow(q.id);
    await expect(acceptQuote(customer, q.id)).rejects.toMatchObject({ code: 'quote_expired' });
    const view = await getMyRequest(customer, req.id);
    expect(view.status).toBe('expired');
    expect(view.quotes[0]!.status).toBe('expired');

    await reopenRequest(ops, req.id);
    expect((await getRequestForOps(ops, req.id)).status).toBe('in_review');

    // The sweep does the same for quotes nobody looked at.
    const other = await createServiceRequest(customer, requestFor(t, 1, 4));
    const q2 = await saveQuoteDraft(ops, { requestId: other.id, workersCount: 1, durationMinutes: 240, hourlyRateRupees: 300 });
    await sendQuote(ops, q2.id);
    await expireQuoteNow(q2.id);
    const swept = await withDb(systemCtx(), (tx) => applyRequestExpiry(tx));
    expect(swept.quotesExpired).toBeGreaterThanOrEqual(1);
    const [row] = await withDb(systemCtx(), (tx) => tx.select({ status: serviceRequests.status }).from(serviceRequests).where(eq(serviceRequests.id, other.id)));
    expect(row!.status).toBe('expired');
  });

  it('handles decline, withdraw and cancel, and the database refuses illegal changes', async () => {
    const t = await eventStaffCity();
    const { ctx: customer } = await createUser(['customer']);
    const ops = await staffCtx(['ops']);

    const a = await createServiceRequest(customer, requestFor(t, 2));
    const qa = await saveQuoteDraft(ops, { requestId: a.id, workersCount: 2, durationMinutes: 240, hourlyRateRupees: 300 });
    await sendQuote(ops, qa.id);
    await expect(saveQuoteDraft(ops, { requestId: a.id, workersCount: 2, durationMinutes: 240, hourlyRateRupees: 250 })).rejects.toMatchObject({ code: 'quote_pending' });
    await withdrawQuote(ops, { quoteId: qa.id, reason: 'Wrong price' });
    expect((await getRequestForOps(ops, a.id)).status).toBe('in_review');
    const qa2 = await saveQuoteDraft(ops, { requestId: a.id, workersCount: 2, durationMinutes: 240, hourlyRateRupees: 250 });
    await sendQuote(ops, qa2.id);
    await respondToQuote(customer, { quoteId: qa2.id, action: 'decline', note: 'Found someone else' });
    expect((await getMyRequest(customer, a.id)).status).toBe('declined');
    await expect(respondToQuote(customer, { quoteId: qa2.id, action: 'decline' })).rejects.toMatchObject({ code: 'quote_not_open' });

    const b = await createServiceRequest(customer, requestFor(t, 1));
    await cancelMyRequest(customer, { requestId: b.id, reason: 'Event moved' });
    await expect(claimRequest(ops, b.id)).rejects.toMatchObject({ code: 'request_closed' });

    const sql = ownerSql();
    try {
      await expect(sql`update quotes set total_paise = 1 where id = ${qa2.id}`).rejects.toThrow(/final/);
      await expect(sql`update service_requests set status = 'submitted' where id = ${a.id}`).rejects.toThrow(/illegal request transition/);
      await expect(sql`delete from service_request_events where request_id = ${a.id}`).rejects.toThrow(/append-only/);
    } finally {
      await sql.end();
    }
  });

  it('keeps requests private to their customer and ops', async () => {
    const t = await eventStaffCity();
    const { ctx: customer } = await createUser(['customer']);
    const { ctx: stranger } = await createUser(['customer']);
    const ops = await staffCtx(['ops']);
    const req = await createServiceRequest(customer, requestFor(t, 1));
    const q = await saveQuoteDraft(ops, { requestId: req.id, workersCount: 1, durationMinutes: 240, hourlyRateRupees: 300 });

    await expect(getMyRequest(stranger, req.id)).rejects.toMatchObject({ code: 'not_found' });
    expect(await withDb(stranger, (tx) => tx.select().from(serviceRequests).where(eq(serviceRequests.id, req.id)))).toEqual([]);
    // The customer cannot read the draft directly either, or change their request's status.
    expect(await withDb(customer, (tx) => tx.select().from(quotes).where(eq(quotes.id, q.id)))).toEqual([]);
    await withDb(customer, (tx) => tx.update(serviceRequests).set({ status: 'cancelled' }).where(eq(serviceRequests.id, req.id)));
    expect((await getMyRequest(customer, req.id)).status).toBe('in_review');
    await expect(claimRequest(customer, req.id)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(acceptQuote(stranger, q.id)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('never puts one person on two overlapping jobs, however they were booked', async () => {
    const t = await eventStaffCity();
    const [w1, w2, w3] = [await staffWorker(t.zone.id), await staffWorker(t.zone.id), await staffWorker(t.zone.id)];
    const { ctx: customer } = await createUser(['customer']);
    const ops = await staffCtx(['ops']);

    const first = await createServiceRequest(customer, requestFor(t, 2));
    const q1 = await saveQuoteDraft(ops, { requestId: first.id, workersCount: 2, durationMinutes: 240, hourlyRateRupees: 300, proposedWorkerIds: [w1.id, w2.id] });
    await sendQuote(ops, q1.id);
    const team = await acceptQuote(customer, q1.id);
    await payWithSandbox(customer, team.bookingId);

    // A second request for the same time: the busy people are not suggested and cannot be proposed.
    const second = await createServiceRequest(customer, requestFor(t, 2));
    const free = (await suggestWorkersForRequest(ops, second.id)).map((w) => w.id);
    expect(free).toContain(w3.id);
    expect(free).not.toContain(w1.id);
    await expect(saveQuoteDraft(ops, { requestId: second.id, workersCount: 2, durationMinutes: 240, hourlyRateRupees: 300, proposedWorkerIds: [w1.id] }))
      .rejects.toMatchObject({ code: 'worker_not_available' });
    const q2 = await saveQuoteDraft(ops, { requestId: second.id, workersCount: 2, durationMinutes: 240, hourlyRateRupees: 300, proposedWorkerIds: [w3.id] });
    await sendQuote(ops, q2.id);

    // w3 is booked directly for the same slot before the customer accepts: the quote still
    // books, with w3's place left empty for ops to fill.
    const { ctx: other } = await createUser(['customer']);
    await createBooking(other, { ...requestFor(t, 1), workerId: w3.id, expectedTotalPaise: STAFF_RATE * 4 });
    const accepted = await acceptQuote(customer, q2.id);
    expect(accepted.assigned).toBe(0);
    await expect(assignWorkerToBooking(ops, { bookingId: accepted.bookingId, workerId: w1.id })).rejects.toMatchObject({ code: 'worker_unavailable' });

    // On a team booking, a worker who pulls out frees only their own place.
    const left = await cancelBooking(w2.ctx, { bookingId: team.bookingId, reason: 'Family emergency' });
    expect(left).toMatchObject({ leftTeam: true });
    const kept = await getBookingForViewer(customer, team.bookingId);
    expect(kept.status).toBe('confirmed');
    expect(kept.workers.map((w) => w.id)).toEqual([w1.id]);
  });

  it('asks for a verified ID for in-home services and limits team size per service', async () => {
    const t = await eventStaffCity();
    const { ctx: customer } = await createUser(['customer']);
    await expect(createServiceRequest(customer, { ...requestFor(t, 51) })).rejects.toThrow();
    const sql = ownerSql();
    try {
      const [row] = await sql`select (config->'workersRequired'->>'max')::int as max from services where slug = 'event-staff'`;
      expect(row?.max).toBe(50);
    } finally {
      await sql.end();
    }
    await withDb(systemCtx(), async (tx) => {
      const [svc] = await tx.select().from(services).where(eq(services.slug, 'elder-care'));
      await tx.insert(serviceCities).values({ serviceId: svc!.id, cityId: t.city.id, status: 'live', pricing: { ...DRIVER_PRICING, hourlyRatePaise: 20000 }, goLiveMinWorkers: 1 });
    });
    await expect(createServiceRequest(customer, { ...requestFor(t, 1), serviceSlug: 'elder-care', answers: { care_need: 'company' } }))
      .rejects.toMatchObject({ code: 'customer_id_required' });
  });
});
