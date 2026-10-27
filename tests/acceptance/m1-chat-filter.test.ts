/**
 * M1 acceptance: chat blocks a phone number typed into a message.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createBooking } from '@/modules/bookings/service';
import { listChatMessages, sendChatMessage } from '@/modules/chat/service';
import { bookingRequest, createDriver, createTestCity, createUser, driverTotal, ownerSql } from '../helpers/fixtures';

describe('M1 chat filter', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  let bookingId: string;
  let customer: Awaited<ReturnType<typeof createUser>>;
  let worker: Awaited<ReturnType<typeof createDriver>>;

  beforeAll(async () => {
    t = await createTestCity({ threshold: 1 });
    worker = await createDriver({ zoneIds: [t.zone.id] });
    customer = await createUser();
    const b = await createBooking(customer.ctx, bookingRequest({ citySlug: t.city.slug, zoneId: t.zone.id, workerId: worker.worker.id, expectedTotalPaise: driverTotal(), days: 3 }));
    bookingId = b.bookingId;
  });

  const phoneVariants = [
    'call me on 9876543210',
    'my number is +91 98765 43210',
    'ping 98765-43210 after 6',
    'nine eight seven six five four three two one zero',
    'nau aath saat chhe paanch chaar teen do ek shunya',
    '9 8 7 6 5 4 3 2 1 0',
    'whatsapp me',
  ];

  it.each(phoneVariants)('blocks "%s" and does not deliver it', async (body) => {
    const out = await sendChatMessage(customer.ctx, bookingId, { body });
    expect(out.status).toBe('blocked');
    expect(out.notice).toMatch(/not sent/);
    const workerSees = await listChatMessages(worker.ctx, bookingId);
    expect(workerSees.find((m) => m.id === out.id)).toBeUndefined();
    const senderSees = await listChatMessages(customer.ctx, bookingId);
    expect(senderSees.find((m) => m.id === out.id)?.status).toBe('blocked');
  });

  it.each(['mail me at someone@example.com', 'pay to ravi@okaxis', 'see https://example.com/pay', 'insta @ravi.drives'])(
    'blocks contact or payment details: "%s"',
    async (body) => {
      expect((await sendChatMessage(worker.ctx, bookingId, { body })).status).toBe('blocked');
    },
  );

  it('delivers an ordinary message to the other party', async () => {
    const out = await sendChatMessage(customer.ctx, bookingId, { body: 'Please come to gate 2, I will be there at 9:45.' });
    expect(out.status).toBe('delivered');
    const workerSees = await listChatMessages(worker.ctx, bookingId);
    expect(workerSees.find((m) => m.id === out.id)?.body).toContain('gate 2');
  });

  it('raises a moderation flag for every blocked message', async () => {
    const out = await sendChatMessage(customer.ctx, bookingId, { body: 'text me 9123456789' });
    const sql = ownerSql();
    try {
      const flags = await sql`select severity, reasons from moderation_flags where entity_id = ${out.id}`;
      expect(flags).toHaveLength(1);
      expect(flags[0]!.severity).toBe('block');
      expect(flags[0]!.reasons).toContain('phone_number');
    } finally {
      await sql.end();
    }
  });

  it('does not let an outsider post into the booking chat', async () => {
    const outsider = await createUser();
    await expect(sendChatMessage(outsider.ctx, bookingId, { body: 'hello' })).rejects.toMatchObject({ code: 'not_found' });
  });
});
