/**
 * M1 acceptance: a worker cannot see another worker's bookings, and a customer cannot see another
 * customer's bookings, even by calling the API directly. Checked at three layers: the HTTP API,
 * the service, and raw SQL under the app role with RLS.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createBooking, listMyBookings, listWorkerJobs } from '@/modules/bookings/service';
import { payWithSandbox } from '@/modules/payments/service';
import { GET as getBookingRoute } from '@/app/api/v1/bookings/[id]/route';
import { GET as listBookingsRoute } from '@/app/api/v1/bookings/route';
import { GET as messagesRoute } from '@/app/api/v1/bookings/[id]/messages/route';
import { bookingRequest, createDriver, createSessionToken, createTestCity, createUser, driverTotal } from '../helpers/fixtures';

describe('M1 data isolation', () => {
  let bookingA: string;
  let customerA: Awaited<ReturnType<typeof createUser>>;
  let customerB: Awaited<ReturnType<typeof createUser>>;
  let workerA: Awaited<ReturnType<typeof createDriver>>;
  let workerB: Awaited<ReturnType<typeof createDriver>>;

  beforeAll(async () => {
    const t = await createTestCity({ threshold: 1 });
    workerA = await createDriver({ zoneIds: [t.zone.id] });
    workerB = await createDriver({ zoneIds: [t.zone.id] });
    customerA = await createUser();
    customerB = await createUser();
    const a = await createBooking(customerA.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: workerA.worker.id, expectedTotalPaise: driverTotal(), days: 3 }));
    await payWithSandbox(customerA.ctx, a.bookingId);
    bookingA = a.bookingId;
    const b = await createBooking(customerB.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: workerB.worker.id, expectedTotalPaise: driverTotal(), days: 3 }));
    await payWithSandbox(customerB.ctx, b.bookingId);
  });

  async function apiGet(userId: string | null, id: string) {
    const headers: Record<string, string> = {};
    if (userId) headers.authorization = `Bearer ${await createSessionToken(userId)}`;
    return getBookingRoute(new Request(`http://test/api/v1/bookings/${id}`, { headers }), { params: Promise.resolve({ id }) });
  }

  it('API: owner and assigned worker can read; other customer, other worker and anonymous cannot', async () => {
    expect((await apiGet(customerA.user.id, bookingA)).status).toBe(200);
    expect((await apiGet(workerA.user.id, bookingA)).status).toBe(200);
    const otherCustomer = await apiGet(customerB.user.id, bookingA);
    expect(otherCustomer.status).toBe(404);
    expect(await otherCustomer.json()).toMatchObject({ error: { code: 'not_found' } });
    expect((await apiGet(workerB.user.id, bookingA)).status).toBe(404);
    expect((await apiGet(null, bookingA)).status).toBe(401);
  });

  it('API: booking lists and chat only return the caller\'s own data', async () => {
    const token = await createSessionToken(customerB.user.id);
    const list = await (await listBookingsRoute(new Request('http://test/api/v1/bookings', { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({}) })).json();
    expect(list.bookings.map((b: { id: string }) => b.id)).not.toContain(bookingA);
    const chat = await messagesRoute(new Request(`http://test/api/v1/bookings/${bookingA}/messages`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ id: bookingA }) });
    expect(chat.status).toBe(404);
  });

  it('service: lists are scoped to the caller', async () => {
    expect((await listMyBookings(customerB.ctx)).map((b) => b.id)).not.toContain(bookingA);
    expect((await listMyBookings(customerA.ctx)).map((b) => b.id)).toContain(bookingA);
    expect((await listWorkerJobs(workerB.ctx)).map((b) => b.id)).not.toContain(bookingA);
    expect((await listWorkerJobs(workerA.ctx)).map((b) => b.id)).toContain(bookingA);
  });

  it('database: RLS hides other users\' bookings, payments and documents even with a raw query', async () => {
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      const asUser = async (userId: string, roles: string, q: (tx: postgres.TransactionSql) => PromiseLike<readonly unknown[]>) =>
        sql.begin(async (tx) => {
          await tx`select set_config('app.user_id', ${userId}, true), set_config('app.roles', ${roles}, true)`;
          return q(tx);
        });
      expect(await asUser(customerB.user.id, 'customer', (tx) => tx`select id from bookings where id = ${bookingA}`)).toHaveLength(0);
      expect(await asUser(customerB.user.id, 'customer', (tx) => tx`select id from payments where booking_id = ${bookingA}`)).toHaveLength(0);
      expect(await asUser(workerB.user.id, 'worker', (tx) => tx`select id from bookings where id = ${bookingA}`)).toHaveLength(0);
      expect(await asUser(workerB.user.id, 'worker', (tx) => tx`select id from worker_documents where worker_id = ${workerA.worker.id}`)).toHaveLength(0);
      expect(await asUser(customerA.user.id, 'customer', (tx) => tx`select id from bookings where id = ${bookingA}`)).toHaveLength(1);
      // Claiming a role you do not hold in the session is not possible through the API; at SQL level,
      // a forged user id with no rows still sees nothing.
      expect(await asUser('00000000-0000-0000-0000-000000000001', 'customer', (tx) => tx`select id from bookings`)).toHaveLength(0);
      // Updates are filtered too.
      const updated = await asUser(customerB.user.id, 'customer', (tx) => tx`update bookings set landmark = 'x' where id = ${bookingA} returning id`);
      expect(updated).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });
});
