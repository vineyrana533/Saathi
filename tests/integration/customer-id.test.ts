/**
 * Customer ID checks (needed before booking in-home services): one check in flight at a time,
 * only verifiers and admins review, a rejection carries a reason, files are encrypted and every
 * view is audit logged, and row-level security keeps each customer's check private.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { idCheckQueue, myIdCheck, readIdCheckFile, reviewIdCheck, submitIdCheck } from '@/modules/identity/id-check';
import { customerIdChecks } from '@/modules/identity/schema';
import { withDb } from '@/platform/db/client';
import { createUser, ownerSql, staffCtx } from '../helpers/fixtures';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 3)]);
const file = { bytes: JPEG, declaredType: 'image/jpeg' };

describe('customer ID checks', () => {
  it('runs from upload to approval, one check at a time', async () => {
    const { ctx } = await createUser(['customer']);
    expect(await myIdCheck(ctx)).toBeNull();
    const check = await submitIdCheck(ctx, { idType: 'pan', numberLast4: 'ab12', consent: true }, file);
    expect(await myIdCheck(ctx)).toMatchObject({ status: 'pending', numberMasked: 'XXXX-XXXX-AB12' });
    await expect(submitIdCheck(ctx, { idType: 'pan', numberLast4: 'AB12', consent: true }, file)).rejects.toMatchObject({ code: 'id_check_pending' });

    const verifier = await staffCtx(['verifier']);
    expect((await idCheckQueue(verifier)).map((c) => c.id)).toContain(check.id);
    const opened = await readIdCheckFile(verifier, check.id);
    expect(Buffer.compare(Buffer.from(opened.bytes), JPEG)).toBe(0);
    await reviewIdCheck(verifier, { checkId: check.id, decision: 'approved' });
    expect(await myIdCheck(ctx)).toMatchObject({ status: 'approved' });
    await expect(submitIdCheck(ctx, { idType: 'pan', numberLast4: 'AB12', consent: true }, file)).rejects.toMatchObject({ code: 'id_already_verified' });

    const sql = ownerSql();
    try {
      const [viewed] = await sql`select count(*)::int as n from audit_log where action = 'customer.id_viewed' and entity_id = ${check.id}`;
      expect(viewed?.n).toBe(1);
      // Only the last 4 characters are kept; the file itself is encrypted at rest.
      const [stored] = await sql`select number_masked, storage_key from customer_id_checks where id = ${check.id}`;
      expect(stored?.number_masked).toBe('XXXX-XXXX-AB12');
      expect(stored?.storage_key).toBeTruthy();
    } finally {
      await sql.end();
    }
  });

  it('needs a reason to reject, and lets the customer try again after a rejection', async () => {
    const { ctx } = await createUser(['customer']);
    const check = await submitIdCheck(ctx, { idType: 'voter_id', numberLast4: '9999', consent: true }, file);
    const verifier = await staffCtx(['verifier']);
    await expect(reviewIdCheck(verifier, { checkId: check.id, decision: 'rejected' })).rejects.toMatchObject({ code: 'note_required' });
    await reviewIdCheck(verifier, { checkId: check.id, decision: 'rejected', note: 'The photo is blurred. Please upload a clearer one.' });
    expect(await myIdCheck(ctx)).toMatchObject({ status: 'rejected', reviewNote: 'The photo is blurred. Please upload a clearer one.' });
    await expect(submitIdCheck(ctx, { idType: 'voter_id', numberLast4: '9999', consent: true }, file)).resolves.toBeTruthy();
  });

  it('keeps checks private: other customers cannot see or review them', async () => {
    const a = await createUser(['customer']);
    const b = await createUser(['customer']);
    const check = await submitIdCheck(a.ctx, { idType: 'aadhaar', numberLast4: '5555', consent: true }, file);
    const seen = await withDb(b.ctx, (tx) => tx.select().from(customerIdChecks).where(eq(customerIdChecks.id, check.id)));
    expect(seen).toEqual([]);
    await expect(reviewIdCheck(b.ctx, { checkId: check.id, decision: 'approved' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(readIdCheckFile(b.ctx, check.id)).rejects.toMatchObject({ code: 'forbidden' });
    // A customer cannot slip an approved row in directly either.
    await expect(
      withDb(b.ctx, (tx) => tx.insert(customerIdChecks).values({ userId: b.user.id, idType: 'pan', numberMasked: 'XXXX-XXXX-0000', status: 'approved' })),
    ).rejects.toThrow();
  });

  it('refuses consent-less uploads and files that are not images or PDFs', async () => {
    const { ctx } = await createUser(['customer']);
    await expect(submitIdCheck(ctx, { idType: 'pan', numberLast4: 'AB12', consent: false }, file)).rejects.toThrow();
    await expect(submitIdCheck(ctx, { idType: 'pan', numberLast4: 'AB12', consent: true }, { bytes: Buffer.from('not a file at all'), declaredType: 'image/jpeg' })).rejects.toMatchObject({ code: 'file_type' });
  });
});
