import { describe, expect, it } from 'vitest';
import {
  activateWorker,
  applyForService,
  readDocumentFile,
  reviewDocument,
  reviewServiceApplication,
  saveWorkerProfile,
  setWeeklyHours,
  uploadDocument,
  verificationQueue,
} from '@/modules/workers/service';
import { searchAvailableWorkers } from '@/modules/bookings/service';
import { resolveSession } from '@/modules/identity/service';
import { createSessionToken, createTestCity, createUser, DRIVER_ANSWERS, ownerSql, slot, staffCtx } from '../helpers/fixtures';
import type { Ctx } from '@/platform/db/client';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 2)]);
const future = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

describe('worker onboarding and verification', () => {
  it('goes from sign-up to searchable driver only through verifier approval', async () => {
    const t = await createTestCity({ threshold: 1 });
    const { user } = await createUser(['customer']);
    // Becoming a worker adds the role; refresh the session's roles as the app would.
    let ctx: Ctx = { userId: user.id, roles: ['customer'], requestId: 'r' };
    await saveWorkerProfile(ctx, {
      displayName: 'Asha', bio: 'Ten years driving in South Delhi.', languages: ['Hindi', 'English'], gender: 'female',
      yearsExperience: 10, homeCitySlug: t.city.slug, zoneIds: [t.zone.id], customerGenderPreference: 'any',
    });
    const session = await resolveSession(await createSessionToken(user.id));
    expect(session!.roles).toContain('worker');
    ctx = { userId: user.id, roles: session!.roles, requestId: 'r' };

    const dl = await uploadDocument(ctx, { docType: 'driving_licence', numberLast4: 'AB12', expiresOn: future(400), vehicleClasses: ['LMV'], consent: true }, { bytes: JPEG, declaredType: 'image/jpeg' });
    const pc = await uploadDocument(ctx, { docType: 'police_certificate', issuedOn: future(-10), consent: true }, { bytes: PDF, declaredType: 'application/pdf' });
    const id = await uploadDocument(ctx, { docType: 'id_proof', idType: 'aadhaar', numberLast4: '4321', consent: true }, { bytes: JPEG, declaredType: 'image/jpeg' });
    const photo = await uploadDocument(ctx, { docType: 'profile_photo', consent: true }, { bytes: JPEG, declaredType: 'image/jpeg' });
    await applyForService(ctx, 'personal-driver');
    await setWeeklyHours(ctx, [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 360, endMinute: 1380 })));

    const search = async () => {
      const c = await createUser();
      return (await searchAvailableWorkers(c.ctx, { serviceSlug: 'personal-driver', citySlug: t.city.slug, zoneId: t.zone.id, ...slot(3), durationMinutes: 240, answers: DRIVER_ANSWERS })).workers.map((w) => w.id);
    };
    const sql = ownerSql();
    const [wp] = await sql`select id, status from worker_profiles where user_id = ${user.id}`;
    expect(wp!.status).toBe('applicant');

    const verifier = await staffCtx(['verifier']);
    const queue = await verificationQueue(verifier);
    expect(queue.docs.map((d) => d.id)).toEqual(expect.arrayContaining([dl.id, pc.id, id.id, photo.id]));

    // Workers cannot approve themselves, at the service or the database level.
    await expect(reviewDocument(ctx, { documentId: dl.id, decision: 'approved' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(activateWorker(verifier, wp!.id)).rejects.toMatchObject({ code: 'not_ready' });

    for (const d of [dl, pc, id, photo]) await reviewDocument(verifier, { documentId: d.id, decision: 'approved' });
    await activateWorker(verifier, wp!.id);
    expect(await search()).not.toContain(wp!.id); // still not approved for the service
    const [appr] = await sql`select id from worker_service_approvals where worker_id = ${wp!.id}`;
    await reviewServiceApplication(verifier, { approvalId: appr!.id, decision: 'approved' });
    expect(await search()).toContain(wp!.id);

    // Stored files are encrypted at rest; reading them is audit logged.
    const [doc] = await sql`select storage_key from worker_documents where id = ${dl.id}`;
    const file = await readDocumentFile(verifier, dl.id);
    expect(file.bytes.equals(JPEG)).toBe(true);
    const [audit] = await sql`select count(*)::int as n from audit_log where action = 'worker.document_viewed' and entity_id = ${dl.id}`;
    expect(audit!.n).toBe(1);
    expect(doc!.storage_key).toMatch(/\.bin$/);
    await sql.end();
  });

  it('rejects expired, oversized, spoofed and contact-laden uploads', async () => {
    const t = await createTestCity();
    const { user } = await createUser(['customer']);
    const base: Ctx = { userId: user.id, roles: ['customer'], requestId: 'r' };
    await saveWorkerProfile(base, { displayName: 'Ravi', bio: '', languages: ['Hindi'], gender: 'male', yearsExperience: 3, homeCitySlug: t.city.slug, zoneIds: [t.zone.id], customerGenderPreference: 'any' });
    const ctx: Ctx = { ...base, roles: ['customer', 'worker'] };
    await expect(uploadDocument(ctx, { docType: 'driving_licence', numberLast4: 'AB12', expiresOn: future(-1), vehicleClasses: ['LMV'], consent: true }, { bytes: JPEG, declaredType: 'image/jpeg' })).rejects.toThrow();
    await expect(uploadDocument(ctx, { docType: 'id_proof', idType: 'pan', numberLast4: '1234', consent: true }, { bytes: Buffer.from('MZ not an image at all'), declaredType: 'image/jpeg' })).rejects.toMatchObject({ code: 'file_type' });
    await expect(uploadDocument(ctx, { docType: 'id_proof', idType: 'pan', numberLast4: '1234', consent: true }, { bytes: Buffer.concat([JPEG, Buffer.alloc(6 * 1024 * 1024)]), declaredType: 'image/jpeg' })).rejects.toMatchObject({ code: 'file_too_large' });
    await expect(
      saveWorkerProfile(ctx, { displayName: 'Ravi', bio: 'Call me on 98765 43210', languages: ['Hindi'], gender: 'male', yearsExperience: 3, homeCitySlug: t.city.slug, zoneIds: [t.zone.id], customerGenderPreference: 'any' }),
    ).rejects.toMatchObject({ code: 'profile_text_blocked' });
  });
});
