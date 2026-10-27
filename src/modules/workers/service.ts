import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  workerDocuments,
  workerProfiles,
  workerServiceApprovals,
  workerTimeOff,
  workerWeeklyHours,
  workerZones,
} from './schema';
import { userRoles, users } from '../identity/schema';
import { services } from '../catalog/schema';
import { serviceConfigSchema } from '../catalog/config';
import { zones, cities } from '../geo/schema';
import { scanText, explainBlock } from '../chat/moderation';
import { moderationFlags } from '../chat/schema';
import { asSystem, withDb, type Ctx, type Tx } from '@/platform/db/client';
import { requirePermission } from '@/platform/auth/permissions';
import { audit } from '@/platform/audit';
import { conflict, invalid, notFound, unauthenticated } from '@/platform/errors';
import { documentStore, MAX_UPLOAD_BYTES, sniffType } from '@/platform/adapters/storage';
import { todayIst } from '@/platform/time';
import { enqueueNotification } from '../notifications/service';

export const LANGUAGES = ['English', 'Hindi', 'Punjabi', 'Marathi', 'Bengali', 'Urdu', 'Tamil', 'Telugu', 'Gujarati', 'Kannada', 'Malayalam'] as const;
export const VEHICLE_CLASSES = ['LMV', 'LMV-TR', 'MCWG', 'TRANS'] as const;

export const workerProfileInput = z.object({
  displayName: z.string().trim().min(2, 'Enter the name customers will see').max(40),
  bio: z.string().trim().max(600).default(''),
  languages: z.array(z.enum(LANGUAGES)).min(1, 'Pick at least one language'),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).nullable(),
  yearsExperience: z.coerce.number().int().min(0).max(50),
  homeCitySlug: z.string(),
  zoneIds: z.array(z.string().uuid()).min(1, 'Pick at least one area you can work in').max(20),
  customerGenderPreference: z.enum(['any', 'female', 'male']).default('any'),
});
export type WorkerProfileInput = z.infer<typeof workerProfileInput>;

async function requireMyWorker(tx: Tx, ctx: Ctx) {
  if (!ctx.userId) throw unauthenticated();
  const [wp] = await tx.select().from(workerProfiles).where(eq(workerProfiles.userId, ctx.userId)).limit(1);
  if (!wp) throw notFound('Worker profile');
  return wp;
}

/** Profile text is scanned like chat: no contact details, no prohibited services. */
function assertCleanProfileText(text: string) {
  if (!text) return;
  const scan = scanText(text);
  if (scan.action === 'block') throw invalid('profile_text_blocked', explainBlock(scan.reasons), { reasons: scan.reasons });
}

export async function getMyWorkerProfile(ctx: Ctx) {
  if (!ctx.userId) return null;
  return withDb(ctx, async (tx) => {
    const [wp] = await tx.select().from(workerProfiles).where(eq(workerProfiles.userId, ctx.userId!)).limit(1);
    if (!wp) return null;
    const [zoneRows, docs, approvals, hours, timeOff] = await Promise.all([
      tx.select({ zoneId: workerZones.zoneId }).from(workerZones).where(eq(workerZones.workerId, wp.id)),
      tx.select({
        id: workerDocuments.id, docType: workerDocuments.docType, status: workerDocuments.status,
        numberMasked: workerDocuments.numberMasked, issuedOn: workerDocuments.issuedOn, expiresOn: workerDocuments.expiresOn,
        attributes: workerDocuments.attributes, reviewNote: workerDocuments.reviewNote, createdAt: workerDocuments.createdAt,
      }).from(workerDocuments).where(eq(workerDocuments.workerId, wp.id)).orderBy(desc(workerDocuments.createdAt)),
      tx.select({ id: workerServiceApprovals.id, status: workerServiceApprovals.status, reason: workerServiceApprovals.reason,
        serviceSlug: services.slug, serviceName: services.name })
        .from(workerServiceApprovals).innerJoin(services, eq(services.id, workerServiceApprovals.serviceId))
        .where(eq(workerServiceApprovals.workerId, wp.id)),
      tx.select().from(workerWeeklyHours).where(eq(workerWeeklyHours.workerId, wp.id)).orderBy(asc(workerWeeklyHours.weekday), asc(workerWeeklyHours.startMinute)),
      tx.select().from(workerTimeOff).where(and(eq(workerTimeOff.workerId, wp.id), sql`${workerTimeOff.endsAt} > now()`)).orderBy(asc(workerTimeOff.startsAt)),
    ]);
    return { profile: wp, zoneIds: zoneRows.map((z) => z.zoneId), documents: docs, approvals, hours, timeOff };
  });
}

export async function saveWorkerProfile(ctx: Ctx, raw: WorkerProfileInput) {
  if (!ctx.userId) throw unauthenticated();
  const input = workerProfileInput.parse(raw);
  assertCleanProfileText(input.bio);
  assertCleanProfileText(input.displayName);
  return withDb(ctx, async (tx) => {
    const [city] = await tx.select().from(cities).where(eq(cities.slug, input.homeCitySlug)).limit(1);
    if (!city) throw invalid('invalid_city', 'Pick a city');
    const validZones = await tx.select({ id: zones.id }).from(zones).where(inArray(zones.id, input.zoneIds));
    if (validZones.length !== input.zoneIds.length) throw invalid('invalid_zone', 'One of the areas is not valid');

    const [existing] = await tx.select().from(workerProfiles).where(eq(workerProfiles.userId, ctx.userId!)).limit(1);
    const values = {
      displayName: input.displayName,
      bio: input.bio,
      languages: [...input.languages],
      gender: input.gender,
      yearsExperience: input.yearsExperience,
      homeCityId: city.id,
      customerGenderPreference: input.customerGenderPreference,
      updatedAt: sql`now()`,
    };
    let wp;
    if (existing) {
      [wp] = await tx.update(workerProfiles).set(values).where(eq(workerProfiles.id, existing.id)).returning();
    } else {
      [wp] = await tx.insert(workerProfiles).values({ ...values, userId: ctx.userId! }).returning();
      await asSystem(tx, ctx, async () => {
        await tx.insert(userRoles).values({ userId: ctx.userId!, role: 'worker' }).onConflictDoNothing();
      });
    }
    if (!wp) throw new Error('worker profile save failed');
    await tx.delete(workerZones).where(eq(workerZones.workerId, wp.id));
    await tx.insert(workerZones).values(input.zoneIds.map((zoneId) => ({ workerId: wp.id, zoneId })));
    await audit(tx, ctx, existing ? 'worker.profile_updated' : 'worker.registered', 'worker', wp.id);
    return wp;
  });
}

export const documentInput = z
  .object({
    docType: z.enum(['driving_licence', 'police_certificate', 'id_proof', 'selfie', 'profile_photo']),
    numberLast4: z.string().regex(/^[A-Za-z0-9]{4}$/, 'Enter the last 4 characters only').optional(),
    idType: z.enum(['aadhaar', 'pan', 'voter_id', 'passport', 'driving_licence']).optional(),
    issuedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    vehicleClasses: z.array(z.enum(VEHICLE_CLASSES)).optional(),
    consent: z.literal(true, { message: 'Consent is needed to verify this document' }),
  })
  .superRefine((v, c) => {
    if (v.docType === 'driving_licence') {
      if (!v.expiresOn) c.addIssue({ code: 'custom', path: ['expiresOn'], message: 'Enter the licence expiry date' });
      if (!v.vehicleClasses?.length) c.addIssue({ code: 'custom', path: ['vehicleClasses'], message: 'Pick the vehicle classes on your licence' });
      if (!v.numberLast4) c.addIssue({ code: 'custom', path: ['numberLast4'], message: 'Enter the last 4 characters of the licence number' });
    }
    if (v.docType === 'police_certificate' && !v.issuedOn) {
      c.addIssue({ code: 'custom', path: ['issuedOn'], message: 'Enter the date the certificate was issued' });
    }
    if (v.docType === 'id_proof' && (!v.idType || !v.numberLast4)) {
      c.addIssue({ code: 'custom', path: ['numberLast4'], message: 'Pick the ID type and enter its last 4 characters' });
    }
    if (v.expiresOn && v.expiresOn <= todayIst()) {
      c.addIssue({ code: 'custom', path: ['expiresOn'], message: 'This document has already expired' });
    }
  });

/** Police certificates are treated as valid for 12 months from issue unless stated (pending sign-off). */
const POLICE_CERT_VALID_MONTHS = 12;

export async function uploadDocument(ctx: Ctx, raw: unknown, file: { bytes: Buffer; declaredType: string }) {
  requirePermission(ctx, 'worker.documents.upload');
  const input = documentInput.parse(raw);
  if (file.bytes.length === 0) throw invalid('empty_file', 'Choose a file to upload');
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw invalid('file_too_large', 'Files must be 5 MB or smaller');
  const sniffed = sniffType(file.bytes);
  if (!sniffed) throw invalid('file_type', 'Upload a JPG, PNG or PDF');
  if ((input.docType === 'selfie' || input.docType === 'profile_photo') && sniffed === 'application/pdf') {
    throw invalid('file_type', 'Upload a photo (JPG or PNG)');
  }

  const stored = await documentStore().put(file.bytes);
  return withDb(ctx, async (tx) => {
    const wp = await requireMyWorker(tx, ctx);
    let expiresOn = input.expiresOn ?? null;
    if (input.docType === 'police_certificate' && !expiresOn && input.issuedOn) {
      const d = new Date(`${input.issuedOn}T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + POLICE_CERT_VALID_MONTHS);
      expiresOn = d.toISOString().slice(0, 10);
    }
    const masked = input.numberLast4 ? `XXXX-XXXX-${input.numberLast4.toUpperCase()}` : null;
    const [doc] = await tx
      .insert(workerDocuments)
      .values({
        workerId: wp.id,
        docType: input.docType,
        status: 'pending',
        numberMasked: masked,
        issuedOn: input.issuedOn ?? null,
        expiresOn,
        attributes: {
          ...(input.vehicleClasses ? { vehicle_classes: input.vehicleClasses } : {}),
          ...(input.idType ? { id_type: input.idType } : {}),
        },
        storageKey: stored.key,
        sha256: stored.sha256,
        mimeType: sniffed,
      })
      .returning({ id: workerDocuments.id });
    if (input.docType === 'profile_photo' && wp.photoStatus !== 'pending') {
      await tx.update(workerProfiles).set({ photoStatus: 'pending' }).where(eq(workerProfiles.id, wp.id));
    }
    await audit(tx, ctx, 'worker.document_uploaded', 'worker_document', doc!.id, { docType: input.docType, consent: true });
    return doc!;
  });
}

export async function applyForService(ctx: Ctx, serviceSlug: string) {
  requirePermission(ctx, 'worker.profile.manage');
  return withDb(ctx, async (tx) => {
    const wp = await requireMyWorker(tx, ctx);
    const [svc] = await tx.select().from(services).where(eq(services.slug, serviceSlug)).limit(1);
    if (!svc || svc.riskTier === 'C') throw notFound('Service');
    const existing = await tx
      .select()
      .from(workerServiceApprovals)
      .where(and(eq(workerServiceApprovals.workerId, wp.id), eq(workerServiceApprovals.serviceId, svc.id)))
      .limit(1);
    if (existing.length) return existing[0]!;
    const [row] = await tx.insert(workerServiceApprovals).values({ workerId: wp.id, serviceId: svc.id, status: 'applied' }).returning();
    await audit(tx, ctx, 'worker.service_applied', 'worker', wp.id, { service: serviceSlug });
    return row!;
  });
}

export const weeklyHoursInput = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
    }),
  )
  .max(21)
  .superRefine((rows, c) => {
    rows.forEach((r, i) => {
      if (r.startMinute >= r.endMinute) c.addIssue({ code: 'custom', path: [i], message: 'End time must be after start time' });
    });
  });

export async function setWeeklyHours(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, 'worker.availability.manage');
  const rows = weeklyHoursInput.parse(raw);
  return withDb(ctx, async (tx) => {
    const wp = await requireMyWorker(tx, ctx);
    await tx.delete(workerWeeklyHours).where(eq(workerWeeklyHours.workerId, wp.id));
    if (rows.length) await tx.insert(workerWeeklyHours).values(rows.map((r) => ({ ...r, workerId: wp.id })));
    await audit(tx, ctx, 'worker.hours_updated', 'worker', wp.id, { slots: rows.length });
  });
}

export async function addTimeOff(ctx: Ctx, input: { startsAt: Date; endsAt: Date; reason?: string }) {
  requirePermission(ctx, 'worker.availability.manage');
  if (!(input.startsAt < input.endsAt)) throw invalid('invalid_range', 'End must be after start');
  return withDb(ctx, async (tx) => {
    const wp = await requireMyWorker(tx, ctx);
    await tx.insert(workerTimeOff).values({ workerId: wp.id, startsAt: input.startsAt, endsAt: input.endsAt, reason: input.reason ?? null });
    await audit(tx, ctx, 'worker.time_off_added', 'worker', wp.id);
  });
}

// ---------- Verifier and admin ----------

export async function verificationQueue(ctx: Ctx) {
  requirePermission(ctx, 'worker.verify');
  return withDb(ctx, async (tx) => {
    const docs = await tx
      .select({
        id: workerDocuments.id, docType: workerDocuments.docType, status: workerDocuments.status,
        numberMasked: workerDocuments.numberMasked, issuedOn: workerDocuments.issuedOn, expiresOn: workerDocuments.expiresOn,
        attributes: workerDocuments.attributes, createdAt: workerDocuments.createdAt, mimeType: workerDocuments.mimeType,
        workerId: workerProfiles.id, workerName: workerProfiles.displayName,
      })
      .from(workerDocuments)
      .innerJoin(workerProfiles, eq(workerProfiles.id, workerDocuments.workerId))
      .where(eq(workerDocuments.status, 'pending'))
      .orderBy(asc(workerDocuments.createdAt))
      .limit(100);
    const applications = await tx
      .select({
        id: workerServiceApprovals.id, status: workerServiceApprovals.status, createdAt: workerServiceApprovals.createdAt,
        workerId: workerProfiles.id, workerName: workerProfiles.displayName, workerStatus: workerProfiles.status,
        serviceName: services.name, serviceSlug: services.slug,
      })
      .from(workerServiceApprovals)
      .innerJoin(workerProfiles, eq(workerProfiles.id, workerServiceApprovals.workerId))
      .innerJoin(services, eq(services.id, workerServiceApprovals.serviceId))
      .where(eq(workerServiceApprovals.status, 'applied'))
      .orderBy(asc(workerServiceApprovals.createdAt))
      .limit(100);
    const applicants = await tx
      .select({ id: workerProfiles.id, displayName: workerProfiles.displayName, kycStatus: workerProfiles.kycStatus,
        photoStatus: workerProfiles.photoStatus, createdAt: workerProfiles.createdAt })
      .from(workerProfiles)
      .where(eq(workerProfiles.status, 'applicant'))
      .orderBy(asc(workerProfiles.createdAt))
      .limit(100);
    return { docs, applications, applicants };
  });
}

export async function reviewDocument(ctx: Ctx, input: { documentId: string; decision: 'approved' | 'rejected'; note?: string }) {
  requirePermission(ctx, 'worker.verify');
  if (input.decision === 'rejected' && !input.note?.trim()) throw invalid('note_required', 'Add a reason the worker can act on');
  return withDb(ctx, async (tx) => {
    const [doc] = await tx.select().from(workerDocuments).where(eq(workerDocuments.id, input.documentId)).limit(1).for('update');
    if (!doc) throw notFound('Document');
    if (doc.status !== 'pending') throw conflict('already_reviewed', 'This document was already reviewed');
    if (input.decision === 'approved' && doc.expiresOn && doc.expiresOn <= todayIst()) {
      throw conflict('document_expired', 'This document has expired and cannot be approved');
    }
    await tx
      .update(workerDocuments)
      .set({ status: input.decision, reviewedBy: ctx.userId, reviewedAt: sql`now()`, reviewNote: input.note ?? null })
      .where(eq(workerDocuments.id, doc.id));
    if (doc.docType === 'id_proof') {
      await asSystem(tx, ctx, async () => {
        await tx
          .update(workerProfiles)
          .set(
            input.decision === 'approved'
              ? { kycStatus: 'verified', kycProviderRef: `manual:${doc.id}`, idNumberMasked: doc.numberMasked }
              : { kycStatus: 'rejected' },
          )
          .where(eq(workerProfiles.id, doc.workerId));
      });
    }
    if (doc.docType === 'profile_photo') {
      await asSystem(tx, ctx, async () => {
        await tx.update(workerProfiles).set({ photoStatus: input.decision }).where(eq(workerProfiles.id, doc.workerId));
      });
    }
    await audit(tx, ctx, `worker.document_${input.decision}`, 'worker_document', doc.id, { docType: doc.docType });
    const [wp] = await tx.select({ userId: workerProfiles.userId }).from(workerProfiles).where(eq(workerProfiles.id, doc.workerId));
    if (wp) {
      await enqueueNotification(tx, {
        channel: 'sms', userId: wp.userId, template: `document_${input.decision}`,
        payload: { docType: doc.docType }, idempotencyKey: `doc-review:${doc.id}`,
      });
    }
  });
}

/** Activates a worker account once identity, police check and photo are approved. */
export async function activateWorker(ctx: Ctx, workerId: string) {
  requirePermission(ctx, 'worker.verify');
  return withDb(ctx, async (tx) => {
    const [wp] = await tx.select().from(workerProfiles).where(eq(workerProfiles.id, workerId)).limit(1).for('update');
    if (!wp) throw notFound('Worker');
    const missing: string[] = [];
    if (wp.kycStatus !== 'verified') missing.push('identity verification');
    if (wp.photoStatus !== 'approved') missing.push('profile photo');
    const police = await tx
      .select({ id: workerDocuments.id })
      .from(workerDocuments)
      .where(and(eq(workerDocuments.workerId, wp.id), eq(workerDocuments.docType, 'police_certificate'),
        eq(workerDocuments.status, 'approved'), sql`(${workerDocuments.expiresOn} is null or ${workerDocuments.expiresOn} > ${todayIst()}::date)`))
      .limit(1);
    if (!police.length) missing.push('police verification');
    if (missing.length) throw conflict('not_ready', `Cannot activate yet. Missing: ${missing.join(', ')}`, { missing });
    await asSystem(tx, ctx, async () => {
      await tx.update(workerProfiles).set({ status: 'active', updatedAt: sql`now()` }).where(eq(workerProfiles.id, wp.id));
    });
    await audit(tx, ctx, 'worker.activated', 'worker', wp.id);
  });
}

/** Approval is per service and requires that service's documents to be approved and valid. */
export async function reviewServiceApplication(ctx: Ctx, input: { approvalId: string; decision: 'approved' | 'rejected'; reason?: string }) {
  requirePermission(ctx, 'worker.verify');
  return withDb(ctx, async (tx) => {
    const [row] = await tx
      .select({ approval: workerServiceApprovals, service: services, worker: workerProfiles })
      .from(workerServiceApprovals)
      .innerJoin(services, eq(services.id, workerServiceApprovals.serviceId))
      .innerJoin(workerProfiles, eq(workerProfiles.id, workerServiceApprovals.workerId))
      .where(eq(workerServiceApprovals.id, input.approvalId))
      .limit(1);
    if (!row) throw notFound('Application');
    if (input.decision === 'approved') {
      if (row.worker.status !== 'active') throw conflict('worker_not_active', 'Activate the worker account first');
      const config = serviceConfigSchema.parse(row.service.config);
      for (const req of config.workerRequirements.documents) {
        const ok = await tx
          .select({ id: workerDocuments.id })
          .from(workerDocuments)
          .where(and(eq(workerDocuments.workerId, row.worker.id), eq(workerDocuments.docType, req.type),
            eq(workerDocuments.status, 'approved'), sql`(${workerDocuments.expiresOn} is null or ${workerDocuments.expiresOn} > ${todayIst()}::date)`))
          .limit(1);
        if (!ok.length) throw conflict('missing_document', `An approved, valid ${req.type.replace('_', ' ')} is required`);
      }
    } else if (!input.reason?.trim()) {
      throw invalid('reason_required', 'Add a reason the worker can act on');
    }
    await tx
      .update(workerServiceApprovals)
      .set({ status: input.decision, reason: input.reason ?? null, reviewedBy: ctx.userId, reviewedAt: sql`now()` })
      .where(eq(workerServiceApprovals.id, row.approval.id));
    await audit(tx, ctx, `worker.service_${input.decision}`, 'worker', row.worker.id, { service: row.service.slug });
  });
}

/** Streams a decrypted document to a verifier or admin. Every access is audit logged. */
export async function readDocumentFile(ctx: Ctx, documentId: string) {
  requirePermission(ctx, 'worker.documents.read');
  const doc = await withDb(ctx, async (tx) => {
    const [d] = await tx.select().from(workerDocuments).where(eq(workerDocuments.id, documentId)).limit(1);
    if (!d || !d.storageKey) throw notFound('Document');
    await audit(tx, ctx, 'worker.document_viewed', 'worker_document', d.id, { docType: d.docType });
    return d;
  });
  return { bytes: await documentStore().get(doc.storageKey!), mimeType: doc.mimeType ?? 'application/octet-stream' };
}

export async function listWorkersForAdmin(ctx: Ctx, opts: { status?: string; q?: string; page?: number }) {
  requirePermission(ctx, 'worker.verify');
  const page = Math.max(1, opts.page ?? 1);
  return withDb(ctx, async (tx) => {
    const conds = [];
    if (opts.status) conds.push(eq(workerProfiles.status, opts.status));
    if (opts.q) conds.push(sql`${workerProfiles.displayName} ilike ${'%' + opts.q.replace(/[%_]/g, '') + '%'}`);
    const rows = await tx
      .select({
        id: workerProfiles.id, displayName: workerProfiles.displayName, status: workerProfiles.status,
        kycStatus: workerProfiles.kycStatus, photoStatus: workerProfiles.photoStatus, workforceModel: workerProfiles.workforceModel,
        ratingAvgX100: workerProfiles.ratingAvgX100, ratingCount: workerProfiles.ratingCount, createdAt: workerProfiles.createdAt,
        phone: users.phoneE164,
      })
      .from(workerProfiles)
      .innerJoin(users, eq(users.id, workerProfiles.userId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(workerProfiles.createdAt))
      .limit(26)
      .offset((page - 1) * 25);
    return { rows: rows.slice(0, 25), hasNext: rows.length > 25, page };
  });
}

/** Flags profile text that needs human review without blocking the save. */
export async function flagForReview(tx: Tx, entityType: string, entityId: string, userId: string | null, reasons: string[]) {
  await tx.insert(moderationFlags).values({ entityType, entityId, userId, reasons, severity: 'review' });
}
