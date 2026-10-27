/**
 * M1 acceptance: two customers trying to book the same worker for the same slot at the same moment:
 * exactly one succeeds. Runs the real booking transaction on separate connections in parallel,
 * then proves the database itself refuses an overlapping assignment even if app checks were skipped.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking } from '@/modules/bookings/service';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, ownerSql } from '../helpers/fixtures';

describe('M1 concurrency', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
  });

  it('lets exactly one of several simultaneous bookings for the same slot succeed', async () => {
    for (let round = 0; round < 3; round++) {
      const w = await createDriver({ zoneIds: [t.zone.id] });
      const customers = await Promise.all(Array.from({ length: 5 }, () => createUser()));
      const results = await Promise.allSettled(
        customers.map((c) =>
          createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 6, time: '09:00' })),
        ),
      );
      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(4);
      for (const f of failed) expect(f.reason).toMatchObject({ code: 'worker_unavailable' });
    }
  });

  it('database exclusion constraint rejects an overlapping active assignment directly', async () => {
    const w = await createDriver({ zoneIds: [t.zone.id] });
    const c = await createUser();
    const b = await createBooking(c.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: w.worker.id, expectedTotalPaise: driverTotal(), days: 7 }));
    const sql = ownerSql();
    try {
      const [orig] = await sql`select starts_at, ends_at from booking_assignments where booking_id = ${b.bookingId}`;
      await expect(
        sql`insert into booking_assignments (booking_id, worker_id, status, starts_at, ends_at)
            values (${b.bookingId}, ${w.worker.id}, 'active', ${orig!.starts_at}, ${orig!.ends_at})`,
      ).rejects.toMatchObject({ code: '23P01' });
    } finally {
      await sql.end();
    }
  });
});
