/**
 * Tier C services (elder care, domestic help, medical support) are bookable online since the
 * owner's decision of 28 Oct 2026 (decisions.md T-31), with their extra checks: the documents
 * each service needs, a verified customer ID, and a feature flag that switches each one off.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getCityServicePage } from '@/modules/seo/service';
import { isOfferable, getServiceInCity } from '@/modules/catalog/service';
import { DRIVER_PRICING } from '@/modules/catalog/seed';
import { serviceCities, services } from '@/modules/catalog/schema';
import { workerDocuments, workerProfiles, workerServiceApprovals, workerWeeklyHours, workerZones } from '@/modules/workers/schema';
import { createBooking, searchAvailableWorkers } from '@/modules/bookings/service';
import { applyForService, listApplicableServices, saveWorkerProfile } from '@/modules/workers/service';
import { reviewIdCheck, submitIdCheck } from '@/modules/identity/id-check';
import { systemCtx, withDb } from '@/platform/db/client';
import { createTestCity, createUser, ensureSeed, slot, staffCtx } from '../helpers/fixtures';
import { listZonesByCitySlug } from '@/modules/geo/service';

const TIER_C = ['elder-care', 'domestic-help', 'medical-support'] as const;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
const NURSE_RATE = 35000;

/** A test city where medical support is live, with one fully verified nurse. */
async function nurseInTestCity() {
  const t = await createTestCity({ threshold: 1 });
  const { user } = await createUser(['worker'], { conduct: true });
  return withDb(systemCtx(), async (tx) => {
    const [svc] = await tx.select().from(services).where(eq(services.slug, 'medical-support'));
    await tx.insert(serviceCities).values({ serviceId: svc!.id, cityId: t.city.id, status: 'live', pricing: { ...DRIVER_PRICING, hourlyRatePaise: NURSE_RATE }, goLiveMinWorkers: 1 });
    const [wp] = await tx
      .insert(workerProfiles)
      .values({ userId: user.id, displayName: 'Nurse Test', languages: ['Hindi'], gender: 'female', yearsExperience: 8, status: 'active', kycStatus: 'verified', kycProviderRef: 'manual:test', photoStatus: 'approved' })
      .returning();
    const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    await tx.insert(workerDocuments).values([
      { workerId: wp!.id, docType: 'police_certificate', status: 'approved', issuedOn: today, expiresOn: nextYear },
      { workerId: wp!.id, docType: 'id_proof', status: 'approved', numberMasked: 'XXXX-XXXX-1111' },
      { workerId: wp!.id, docType: 'nursing_registration', status: 'approved', numberMasked: 'XXXX-XXXX-2222', expiresOn: nextYear },
      { workerId: wp!.id, docType: 'medical_qualification', status: 'approved', issuedOn: today },
    ]);
    await tx.insert(workerServiceApprovals).values({ workerId: wp!.id, serviceId: svc!.id, status: 'approved' });
    await tx.insert(workerZones).values({ workerId: wp!.id, zoneId: t.zone.id });
    await tx.insert(workerWeeklyHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ workerId: wp!.id, weekday, startMinute: 7 * 60, endMinute: 21 * 60 })));
    return { ...t, nurse: wp! };
  });
}

describe('Tier C services', () => {
  beforeAll(ensureSeed);

  it.each(TIER_C)('%s is open in Delhi with a price and its extra checks', async (slug) => {
    const page = await getCityServicePage('delhi', slug);
    expect(page).not.toBeNull();
    expect(page!.service.riskTier).toBe('C');
    expect(page!.service.status).toBe('active');
    expect(page!.flagEnabled).toBe(true);
    expect(page!.serviceCity.status).toBe('live');
    expect(page!.serviceCity.pricing.hourlyRatePaise).toBeGreaterThan(0);
    expect(page!.service.config.customerVerification).toBe('id');
    expect(page!.service.config.workerRequirements.requirePoliceVerification).toBe(true);
  });

  it('requires the extra documents each service needs', async () => {
    const docs = async (slug: string) => (await getServiceInCity(slug, 'delhi'))!.service.config.workerRequirements.documents.map((d) => d.type);
    expect(await docs('elder-care')).toEqual(['caregiver_training', 'first_aid_certificate']);
    expect(await docs('medical-support')).toEqual(['nursing_registration', 'medical_qualification']);
  });

  it('is offerable only while its feature flag is on', async () => {
    for (const slug of TIER_C) {
      const s = (await getServiceInCity(slug, 'delhi'))!;
      expect(isOfferable(s)).toBe(true);
      expect(isOfferable({ ...s, flagEnabled: false })).toBe(false);
      expect(isOfferable({ ...s, service: { ...s.service, featureFlagKey: null } })).toBe(false);
    }
  });

  it('needs a verified customer ID before booking, then books like any other service', async () => {
    const t = await nurseInTestCity();
    const { ctx } = await createUser(['customer']);
    const search = await searchAvailableWorkers(ctx, {
      serviceSlug: 'medical-support', citySlug: t.city.slug, zoneId: t.zone.id, ...slot(2, '10:00'), durationMinutes: 240, answers: { support_need: 'medicines' },
    });
    expect(search.live).toBe(true);
    expect(search.workers.map((w) => w.id)).toContain(t.nurse.id);
    const request = {
      serviceSlug: 'medical-support', citySlug: t.city.slug, zoneId: t.zone.id, ...slot(2, '10:00'), durationMinutes: 240,
      answers: { support_need: 'medicines' }, workerId: t.nurse.id, addressLine: 'House 4, Test Road', expectedTotalPaise: NURSE_RATE * 4,
    };

    await expect(createBooking(ctx, request)).rejects.toMatchObject({ code: 'customer_id_required' });
    const check = await submitIdCheck(ctx, { idType: 'aadhaar', numberLast4: '1234', consent: true }, { bytes: JPEG, declaredType: 'image/jpeg' });
    // Still blocked while the check is pending.
    await expect(createBooking(ctx, request)).rejects.toMatchObject({ code: 'customer_id_required' });
    await reviewIdCheck(await staffCtx(['verifier']), { checkId: check.id, decision: 'approved' });

    const booking = await createBooking(ctx, request);
    expect(booking.ref).toMatch(/^SA-/);
    const [row] = await withDb(systemCtx(), (tx) => tx.execute<{ status: string; total: number }>(sql`select status, total_paise::int as total from bookings where id = ${booking.bookingId}`));
    expect(row).toMatchObject({ status: 'pending_payment', total: NURSE_RATE * 4 });
  });

  it('lets workers apply for Tier C services but not for a disabled Tier B one', async () => {
    const open = (await listApplicableServices()).map((s) => s.slug);
    for (const slug of TIER_C) expect(open).toContain(slug);
    expect(open).not.toContain('social-companion');

    const { user } = await createUser(['customer']);
    const zone = (await listZonesByCitySlug('delhi'))[0]!;
    await saveWorkerProfile({ userId: user.id, roles: ['customer'], requestId: 'r' }, {
      displayName: 'Carer', bio: '', languages: ['Hindi'], gender: 'female', yearsExperience: 4, homeCitySlug: 'delhi', zoneIds: [zone.id], customerGenderPreference: 'any',
    });
    const worker = { userId: user.id, roles: ['customer', 'worker'] as const, requestId: 'r' };
    for (const slug of TIER_C) {
      await expect(applyForService({ ...worker, roles: [...worker.roles] }, slug)).resolves.toMatchObject({ status: 'applied' });
    }
    await expect(applyForService({ ...worker, roles: [...worker.roles] }, 'social-companion')).rejects.toMatchObject({ code: 'not_found' });
  });
});
