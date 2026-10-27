/**
 * M1 acceptance: a job cannot start without the correct customer OTP.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking, finishJob, getBookingForViewer, startJob } from '@/modules/bookings/service';
import { payWithSandbox } from '@/modules/payments/service';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, ownerSql } from '../helpers/fixtures';

describe('M1 start and end OTP', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  async function confirmedBooking(nearNow = true) {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const c = await createUser();
    const b = await createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 2 }));
    await payWithSandbox(c.ctx, b.bookingId);
    if (nearNow) {
      const sql = ownerSql();
      await sql`update bookings set starts_at = now() + interval '15 minutes' where id = ${b.bookingId}`;
      await sql.end();
    }
    const view = await getBookingForViewer(c.ctx, b.bookingId);
    return { w, c, b, startCode: view.codes.start! };
  }

  const wrongCode = (code: string) => String((Number(code) + 1) % 10000).padStart(4, '0');

  it('rejects a wrong code and keeps the job confirmed; accepts the right one', async () => {
    const { w, c, b, startCode } = await confirmedBooking();
    expect(startCode).toMatch(/^\d{4}$/);
    await expect(startJob(w.ctx, b.bookingId, wrongCode(startCode))).rejects.toMatchObject({ code: 'wrong_code' });
    expect((await getBookingForViewer(c.ctx, b.bookingId)).status).toBe('confirmed');
    await expect(startJob(w.ctx, b.bookingId, '')).rejects.toMatchObject({ code: 'invalid_code' });
    expect(await startJob(w.ctx, b.bookingId, startCode)).toMatchObject({ status: 'in_progress' });
  });

  it('counts wrong attempts across requests and locks after five', async () => {
    const { w, b, startCode } = await confirmedBooking();
    for (let i = 0; i < 5; i++) {
      await expect(startJob(w.ctx, b.bookingId, wrongCode(startCode))).rejects.toMatchObject({ code: 'wrong_code' });
    }
    await expect(startJob(w.ctx, b.bookingId, startCode)).rejects.toMatchObject({ code: 'otp_locked' });
  });

  it('does not let the customer or another worker start the job', async () => {
    const { c, b, startCode } = await confirmedBooking();
    await expect(startJob(c.ctx, b.bookingId, startCode)).rejects.toMatchObject({ code: 'forbidden' });
    const other = await createDriver({ zoneIds: [t.zone.id] });
    await expect(startJob(other.ctx, b.bookingId, startCode)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses to start far from the booked time', async () => {
    const { w, b, startCode } = await confirmedBooking(false);
    await expect(startJob(w.ctx, b.bookingId, startCode)).rejects.toMatchObject({ code: 'outside_start_window' });
  });

  it('needs the end code to complete, and never shows codes to the worker', async () => {
    const { w, c, b, startCode } = await confirmedBooking();
    const workerView = await getBookingForViewer(w.ctx, b.bookingId);
    expect(workerView.codes).toEqual({ start: null, end: null });
    await startJob(w.ctx, b.bookingId, startCode);
    const endCode = (await getBookingForViewer(c.ctx, b.bookingId)).codes.end!;
    await expect(finishJob(w.ctx, b.bookingId, startCode === endCode ? wrongCode(endCode) : startCode)).rejects.toMatchObject({ code: 'wrong_code' });
    expect(await finishJob(w.ctx, b.bookingId, endCode)).toMatchObject({ status: 'completed' });
  });

  it('cannot start a booking that has not been paid', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const c = await createUser();
    const b = await createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 2 }));
    await expect(startJob(w.ctx, b.bookingId, '0000')).rejects.toMatchObject({ code: 'wrong_status' });
  });
});
