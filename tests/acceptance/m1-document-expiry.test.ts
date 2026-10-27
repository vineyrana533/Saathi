/**
 * M1 acceptance: a worker whose driving licence has expired disappears from driver search automatically.
 * "Automatically" means without any job or admin action: eligibility checks the expiry date directly.
 * The hourly sweep then marks the document expired and suspends the approval.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking, searchAvailableWorkers } from '@/modules/bookings/service';
import { documentExpirySweep } from '@/modules/jobs/service';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, DRIVER_ANSWERS, ownerSql, slot } from '../helpers/fixtures';

describe('M1 document expiry', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  async function search(days: number) {
    const { ctx } = await createUser();
    const res = await searchAvailableWorkers(ctx, {
      serviceSlug: 'personal-driver', citySlug: t.city.slug, zoneId: t.zone.id, ...slot(days), durationMinutes: 240, answers: DRIVER_ANSWERS,
    });
    return res.workers.map((w) => w.id);
  }

  it('drops a driver from search the moment the licence expiry date passes', async () => {
    // A second valid driver keeps the city above its go-live threshold, so the refusal below
    // is about this worker, not about the city closing.
    await createDriver({ zoneIds: [t.zone.id] });
    const w = await createDriver({ zoneIds: [t.zone.id] });
    expect(await search(2)).toContain(w.worker.id);

    const sql = ownerSql();
    try {
      await sql`update worker_documents set expires_on = current_date - 1 where worker_id = ${w.worker.id} and doc_type = 'driving_licence'`;
    } finally {
      await sql.end();
    }
    expect(await search(2)).not.toContain(w.worker.id);
    const c = await createUser();
    await expect(
      createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 2 })),
    ).rejects.toMatchObject({ code: 'worker_unavailable' });
  });

  it('hides a driver for dates after the licence expires, but not before', async () => {
    const expires = slot(5).date;
    const w = await createDriver({ zoneIds: [t.zone.id], licenceExpiresOn: expires });
    expect(await search(3)).toContain(w.worker.id);
    expect(await search(8)).not.toContain(w.worker.id);
  });

  it('the sweep marks the licence expired, suspends the driver approval and notifies the worker', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const sql = ownerSql();
    try {
      await sql`update worker_documents set expires_on = current_date - 1 where worker_id = ${w.worker.id} and doc_type = 'driving_licence'`;
      const out = await documentExpirySweep();
      expect(out.expired).toBeGreaterThanOrEqual(1);
      const [doc] = await sql`select status from worker_documents where worker_id = ${w.worker.id} and doc_type = 'driving_licence'`;
      expect(doc!.status).toBe('expired');
      const [appr] = await sql`select status, reason from worker_service_approvals where worker_id = ${w.worker.id}`;
      expect(appr!.status).toBe('suspended');
      const notes = await sql`select count(*)::int as n from notification_outbox where user_id = ${w.user.id} and template = 'document_expired'`;
      expect(notes[0]!.n).toBe(1);
      // Running the sweep again changes nothing and sends nothing new.
      await documentExpirySweep();
      const again = await sql`select count(*)::int as n from notification_outbox where user_id = ${w.user.id} and template = 'document_expired'`;
      expect(again[0]!.n).toBe(1);
    } finally {
      await sql.end();
    }
  });
});
