import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { customerIdChecks, users } from './schema';
import { withDb, type Ctx, type Tx } from '@/platform/db/client';
import { requirePermission } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { conflict, invalid, notFound } from '@/platform/errors';
import { documentStore, MAX_UPLOAD_BYTES, sniffType } from '@/platform/adapters/storage';
import { maskPhone } from '@/platform/auth/phone';

/**
 * Customer ID checks for services whose config says customerVerification 'id' (Tier B and C).
 * A verifier compares the uploaded ID with the name on the account by eye; no KYC vendor is
 * connected yet (decisions.md V-04). Only the last 4 characters of the number are stored.
 */
export const ID_TYPES = ['aadhaar', 'pan', 'voter_id', 'passport', 'driving_licence'] as const;
export type IdType = (typeof ID_TYPES)[number];

export const idCheckInput = z.object({
  idType: z.enum(ID_TYPES),
  numberLast4: z.string().regex(/^[A-Za-z0-9]{4}$/, 'Enter the last 4 characters only'),
  consent: z.literal(true, { message: 'Consent is needed to check your ID' }),
});

const PUBLIC_FIELDS = {
  id: customerIdChecks.id,
  idType: customerIdChecks.idType,
  numberMasked: customerIdChecks.numberMasked,
  status: customerIdChecks.status,
  reviewNote: customerIdChecks.reviewNote,
  createdAt: customerIdChecks.createdAt,
};

async function latestIdCheck(tx: Tx, userId: string) {
  const [row] = await tx
    .select(PUBLIC_FIELDS)
    .from(customerIdChecks)
    .where(eq(customerIdChecks.userId, userId))
    .orderBy(desc(customerIdChecks.createdAt))
    .limit(1);
  return row ?? null;
}

/** True when the user has an approved ID check. Runs inside the caller's transaction (RLS: own rows). */
export async function hasVerifiedId(tx: Tx, userId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: customerIdChecks.id })
    .from(customerIdChecks)
    .where(and(eq(customerIdChecks.userId, userId), eq(customerIdChecks.status, 'approved')))
    .limit(1);
  return !!row;
}

/** The signed-in customer's latest ID check, or null if they have never sent one. */
export async function myIdCheck(ctx: Ctx) {
  requirePermission(ctx, 'customer.id.submit');
  return withDb(ctx, (tx) => latestIdCheck(tx, ctx.userId!));
}

export async function submitIdCheck(ctx: Ctx, raw: unknown, file: { bytes: Buffer; declaredType: string }) {
  requirePermission(ctx, 'customer.id.submit');
  const input = idCheckInput.parse(raw);
  if (file.bytes.length === 0) throw invalid('empty_file', 'Choose a file to upload');
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw invalid('file_too_large', 'Files must be 5 MB or smaller');
  const sniffed = sniffType(file.bytes);
  if (!sniffed) throw invalid('file_type', 'Upload a JPG, PNG or PDF');

  // One check in flight at a time, so nobody can fill the queue or storage with repeat uploads.
  const current = await withDb(ctx, (tx) => latestIdCheck(tx, ctx.userId!));
  if (current?.status === 'pending') throw conflict('id_check_pending', 'Your ID is already being checked');
  if (current?.status === 'approved') throw conflict('id_already_verified', 'Your ID is already verified');

  const stored = await documentStore().put(file.bytes);
  return withDb(ctx, async (tx) => {
    const [row] = await tx
      .insert(customerIdChecks)
      .values({
        userId: ctx.userId!,
        idType: input.idType,
        numberMasked: `XXXX-XXXX-${input.numberLast4.toUpperCase()}`,
        status: 'pending',
        storageKey: stored.key,
        sha256: stored.sha256,
        mimeType: sniffed,
      })
      .returning({ id: customerIdChecks.id });
    await audit(tx, ctx, 'customer.id_submitted', 'customer_id_check', row!.id, { idType: input.idType, consent: true });
    return row!;
  });
}

// ---------- Verifier and admin ----------

export async function idCheckQueue(ctx: Ctx) {
  requirePermission(ctx, 'customer.id.review');
  return withDb(ctx, async (tx) => {
    const rows = await tx
      .select({ ...PUBLIC_FIELDS, displayName: users.displayName, phoneE164: users.phoneE164 })
      .from(customerIdChecks)
      .innerJoin(users, eq(users.id, customerIdChecks.userId))
      .where(eq(customerIdChecks.status, 'pending'))
      .orderBy(asc(customerIdChecks.createdAt))
      .limit(100);
    return rows.map(({ phoneE164, ...r }) => ({ ...r, phoneMasked: maskPhone(phoneE164) }));
  });
}

export async function reviewIdCheck(ctx: Ctx, input: { checkId: string; decision: 'approved' | 'rejected'; note?: string }) {
  requirePermission(ctx, 'customer.id.review');
  if (input.decision === 'rejected' && !input.note?.trim()) throw invalid('note_required', 'Add a reason the customer can act on');
  return withDb(ctx, async (tx) => {
    const [row] = await tx
      .update(customerIdChecks)
      .set({ status: input.decision, reviewNote: input.note?.trim() || null, reviewedBy: ctx.userId, reviewedAt: sql`now()` })
      .where(and(eq(customerIdChecks.id, input.checkId), eq(customerIdChecks.status, 'pending')))
      .returning({ id: customerIdChecks.id });
    if (!row) throw notFound('ID check');
    await audit(tx, ctx, `customer.id_${input.decision}`, 'customer_id_check', row.id);
  });
}

/** Streams a decrypted ID file to a verifier or admin. Every view is audit logged. */
export async function readIdCheckFile(ctx: Ctx, checkId: string) {
  requirePermission(ctx, 'customer.id.review');
  const check = await withDb(ctx, async (tx) => {
    const [c] = await tx.select().from(customerIdChecks).where(eq(customerIdChecks.id, checkId)).limit(1);
    if (!c || !c.storageKey) throw notFound('ID check');
    await audit(tx, ctx, 'customer.id_viewed', 'customer_id_check', c.id, { idType: c.idType });
    return c;
  });
  return { bytes: await documentStore().get(check.storageKey!), mimeType: check.mimeType ?? 'application/octet-stream' };
}
