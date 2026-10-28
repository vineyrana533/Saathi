import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { joinWaitlist, listWaitlistEntries, setWaitlistStatus } from '@/modules/seo/service';
import { createEnquiry, listEnquiries, setEnquiryStatus } from '@/modules/requests/service';
import { createUser, ensureSeed, ownerSql, randomPhone, staffCtx } from '../helpers/fixtures';

describe('waitlist and request follow-up', () => {
  it('shows ops each sign-up with contact details and lets them mark it contacted', async () => {
    await ensureSeed();
    const phone = randomPhone();
    await joinWaitlist({ citySlug: 'delhi', serviceSlug: 'elder-care', name: 'Meera', phone, need: 'Company for my mother on weekdays', wantedOn: '' }, `10.40.0.${Math.floor(Math.random() * 200)}`);
    const ops = await staffCtx(['ops']);
    const fresh = await listWaitlistEntries(ops, { status: 'new' });
    const entry = fresh.rows.find((r) => r.phoneE164 === phone);
    expect(entry).toMatchObject({ name: 'Meera', service: 'Elder care', city: 'Delhi', status: 'new' });

    await setWaitlistStatus(ops, { id: entry!.id, status: 'contacted' });
    const contacted = await listWaitlistEntries(ops, { status: 'contacted' });
    const after = contacted.rows.find((r) => r.id === entry!.id);
    expect(after?.status).toBe('contacted');
    expect(after?.contactedAt).toBeInstanceOf(Date);
    expect((await listWaitlistEntries(ops, { status: 'new' })).rows.some((r) => r.id === entry!.id)).toBe(false);

    const sql = ownerSql();
    const [log] = await sql`select count(*)::int as n from audit_log where action = 'waitlist.status_changed' and entity_id = ${entry!.id}`;
    await sql.end();
    expect(log!.n).toBe(1);
  });

  it('does not let customers, workers or verifiers see or change follow-ups', async () => {
    await ensureSeed();
    const customer = await createUser();
    await expect(listWaitlistEntries(customer.ctx)).rejects.toMatchObject({ code: 'forbidden' });
    const verifier = await staffCtx(['verifier']);
    await expect(setWaitlistStatus(verifier, { id: '00000000-0000-0000-0000-000000000000', status: 'contacted' })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('blocks status changes at the database level for non-staff, even with raw SQL', async () => {
    await ensureSeed();
    const phone = randomPhone();
    await joinWaitlist({ citySlug: 'noida', serviceSlug: 'domestic-help', name: 'Ravi', phone, need: 'Cleaning twice a week', wantedOn: '' }, '10.41.0.1');
    const customer = await createUser();
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      const updated = await sql.begin(async (tx) => {
        await tx`select set_config('app.user_id', ${customer.user.id}, true), set_config('app.roles', 'customer', true)`;
        return tx`update waitlist_entries set status = 'closed' where phone_e164 = ${phone} returning id`;
      });
      expect(updated).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });

  it('lets ops mark "something else" requests as contacted', async () => {
    await ensureSeed();
    const phone = randomPhone();
    await createEnquiry({ name: 'Asha', phone, citySlug: 'gurugram', need: 'Two people to help shift furniture', consent: true }, '10.42.0.1');
    const ops = await staffCtx(['ops']);
    const req = (await listEnquiries(ops)).find((r) => r.phoneE164 === phone)!;
    await setEnquiryStatus(ops, { id: req.id, status: 'contacted' });
    expect((await listEnquiries(ops)).find((r) => r.id === req.id)?.status).toBe('contacted');
  });
});
