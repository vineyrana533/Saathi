import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { enquiries } from './schema';
import { cities } from '../geo/schema';
import { scanText, explainBlock } from '../chat/moderation';
import { anonymousCtx, withDb, type Ctx } from '@/platform/db/client';
import { normaliseIndianMobile } from '@/platform/auth/phone';
import { enforceRateLimit, LIMITS } from '@/platform/rate-limit';
import { requirePermission } from '@/platform/auth/permissions';
import { invalid } from '@/platform/errors';
import { todayIst } from '@/platform/time';

export const enquiryInput = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(60),
  phone: z.string().min(10, 'Enter your mobile number').max(20),
  citySlug: z.string().min(1, 'Pick a city'),
  need: z.string().trim().min(5, 'Tell us a little about the job').max(1000),
  wantedOn: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).optional(),
  consent: z.literal(true, { message: 'Please agree that our team can contact you about this request' }),
});

/**
 * Stores a request for work that is not a listed service. Prohibited services (section 5) are
 * refused outright; ambiguous wording is stored but marked for review before anyone calls.
 */
export async function createEnquiry(raw: unknown, ip: string) {
  const input = enquiryInput.parse(raw);
  const phone = normaliseIndianMobile(input.phone);
  if (input.wantedOn && input.wantedOn < todayIst()) throw invalid('date_past', 'Pick today or a later date', { field: 'wantedOn' });
  const scan = scanText(input.need);
  if (scan.reasons.includes('prohibited_service')) throw invalid('request_blocked', explainBlock(scan.reasons), { field: 'need' });
  await enforceRateLimit(`enquiry:${ip}`, LIMITS.waitlistPerIp);
  return withDb(anonymousCtx(), async (tx) => {
    const [city] = await tx.select({ id: cities.id }).from(cities).where(eq(cities.slug, input.citySlug)).limit(1);
    if (!city) throw invalid('invalid_city', 'Pick a city', { field: 'citySlug' });
    const needsReview = scan.action === 'review';
    await tx.insert(enquiries).values({
      name: input.name,
      phoneE164: phone,
      cityId: city.id,
      need: input.need,
      wantedOn: input.wantedOn || null,
      status: needsReview ? 'needs_review' : 'new',
      reviewReasons: needsReview ? scan.reasons : [],
    });
    return { ok: true as const, needsReview };
  });
}

export async function listEnquiries(ctx: Ctx) {
  requirePermission(ctx, 'waitlist.read');
  return withDb(ctx, (tx) =>
    tx
      .select({
        id: enquiries.id,
        name: enquiries.name,
        phoneE164: enquiries.phoneE164,
        city: cities.name,
        need: enquiries.need,
        wantedOn: enquiries.wantedOn,
        status: enquiries.status,
        createdAt: enquiries.createdAt,
      })
      .from(enquiries)
      .innerJoin(cities, eq(cities.id, enquiries.cityId))
      .orderBy(desc(enquiries.createdAt))
      .limit(100),
  );
}
