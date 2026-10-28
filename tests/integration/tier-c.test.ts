/**
 * Tier C services (elder care, domestic help, medical support) are configured but must never be
 * bookable until licences, legal review and sign-off are done (brief section 4; decisions.md T-27).
 */
import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { getCityServicePage } from '@/modules/seo/service';
import { isOfferable, getServiceInCity } from '@/modules/catalog/service';
import { createBooking } from '@/modules/bookings/service';
import { applyForService, saveWorkerProfile } from '@/modules/workers/service';
import { createUser, ensureSeed } from '../helpers/fixtures';
import { listZonesByCitySlug } from '@/modules/geo/service';

const TIER_C = ['elder-care', 'domestic-help', 'medical-support'] as const;

describe('Tier C services', () => {
  it.each(TIER_C)('%s has a "coming later" page that is never live or indexable', async (slug) => {
    await ensureSeed();
    const page = await getCityServicePage('delhi', slug);
    expect(page).not.toBeNull();
    expect(page!.service.riskTier).toBe('C');
    expect(page!.supply.live).toBe(false);
    expect(page!.indexable).toBe(false);
    expect(page!.service.config.customerVerification).toBe('id');
    expect(page!.service.config.workerRequirements.requirePoliceVerification).toBe(true);
  });

  it('requires the extra documents each service needs', async () => {
    await ensureSeed();
    const docs = async (slug: string) => (await getServiceInCity(slug, 'delhi'))!.service.config.workerRequirements.documents.map((d) => d.type);
    expect(await docs('elder-care')).toEqual(['caregiver_training', 'first_aid_certificate']);
    expect(await docs('medical-support')).toEqual(['nursing_registration', 'medical_qualification']);
  });

  it('stays unbookable even if the city status and feature flag were switched on', async () => {
    await ensureSeed();
    for (const slug of TIER_C) {
      const s = (await getServiceInCity(slug, 'delhi'))!;
      const forced = { ...s, flagEnabled: true, service: { ...s.service, status: 'active' }, serviceCity: { ...s.serviceCity, status: 'live' } };
      expect(isOfferable(forced)).toBe(false);
    }
  });

  it('refuses bookings and keeps the pages out of the sitemap', async () => {
    await ensureSeed();
    const { ctx } = await createUser();
    const zone = (await listZonesByCitySlug('delhi'))[0]!;
    await expect(
      createBooking(ctx, {
        serviceSlug: 'medical-support', citySlug: 'delhi', zoneId: zone.id, date: '2030-01-10', time: '10:00', durationMinutes: 240,
        answers: { support_need: 'medicines' }, workerId: '00000000-0000-0000-0000-000000000000', addressLine: 'House 1, Test Road', expectedTotalPaise: 0,
      }),
      // Refused either way: Tier C needs a verified customer ID (checked first) and is never live.
    ).rejects.toMatchObject({ code: expect.stringMatching(/^(customer_id_required|not_live)$/) });
    const urls = (await sitemap()).map((e) => e.url);
    for (const slug of TIER_C) expect(urls.some((u) => u.endsWith(`/${slug}`))).toBe(false);
  });

  it('does not let workers apply for them yet', async () => {
    await ensureSeed();
    const { user } = await createUser(['customer']);
    const base = { userId: user.id, roles: ['customer'] as const, requestId: 'r' };
    const zone = (await listZonesByCitySlug('delhi'))[0]!;
    await saveWorkerProfile({ ...base, roles: ['customer'] }, {
      displayName: 'Carer', bio: '', languages: ['Hindi'], gender: 'female', yearsExperience: 4, homeCitySlug: 'delhi', zoneIds: [zone.id], customerGenderPreference: 'any',
    });
    for (const slug of TIER_C) {
      await expect(applyForService({ ...base, roles: ['customer', 'worker'] }, slug)).rejects.toMatchObject({ code: 'not_found' });
    }
  });
});
