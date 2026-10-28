import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createEnquiry, listEnquiries } from '@/modules/requests/service';
import { createUser, ensureSeed, ownerSql, randomPhone, staffCtx } from '../helpers/fixtures';

const base = () => ({ name: 'Test Person', phone: randomPhone(), citySlug: 'noida', need: 'Two people to help carry boxes on Saturday morning', consent: true as const });

describe('"something else" requests', () => {
  it('stores a valid request as new and shows it to ops', async () => {
    await ensureSeed();
    const input = base();
    await expect(createEnquiry(input, '10.20.0.1')).resolves.toEqual({ ok: true, needsReview: false });
    const ops = await staffCtx(['ops']);
    const rows = await listEnquiries(ops);
    expect(rows.find((r) => r.phoneE164 === input.phone)?.status).toBe('new');
  });

  it('refuses prohibited services outright', async () => {
    await ensureSeed();
    await expect(createEnquiry({ ...base(), need: 'Need a cuddle partner for tonight' }, '10.20.0.2')).rejects.toMatchObject({ code: 'request_blocked' });
  });

  it('marks ambiguous wording for review instead of dropping it', async () => {
    await ensureSeed();
    await expect(createEnquiry({ ...base(), need: 'Someone to sit with my father during his therapy appointment' }, '10.20.0.3')).resolves.toEqual({ ok: true, needsReview: true });
  });

  it('requires consent and a real city', async () => {
    await ensureSeed();
    await expect(createEnquiry({ ...base(), consent: false }, '10.20.0.4')).rejects.toThrow();
    await expect(createEnquiry({ ...base(), citySlug: 'atlantis' }, '10.20.0.5')).rejects.toMatchObject({ code: 'invalid_city' });
  });

  it('is invisible to customers and anonymous visitors, even with raw SQL', async () => {
    await ensureSeed();
    await createEnquiry(base(), '10.20.0.6');
    const customer = await createUser();
    await expect(listEnquiries(customer.ctx)).rejects.toMatchObject({ code: 'forbidden' });
    const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      const rows = await sql.begin(async (tx) => {
        await tx`select set_config('app.user_id', ${customer.user.id}, true), set_config('app.roles', 'customer', true)`;
        return tx`select id from enquiries`;
      });
      expect(rows).toHaveLength(0);
      const owner = ownerSql();
      const [all] = await owner`select count(*)::int as n from enquiries`;
      await owner.end();
      expect(all!.n).toBeGreaterThan(0);
    } finally {
      await sql.end();
    }
  });
});
