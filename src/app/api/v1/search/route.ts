import { api, clientIp } from '@/platform/http';
import { enforceRateLimit, LIMITS } from '@/platform/rate-limit';
import { searchAvailableWorkers } from '@/modules/bookings/service';

/**
 * GET /api/v1/search?service=personal-driver&city=delhi&loc=<locality uuid>&date=YYYY-MM-DD&time=HH:MM&duration=240
 *   &a.vehicle_class=LMV&a.transmission=manual
 * Booking answers are passed as a.<questionId>. Location: loc (a locality), or lat and lng (a phone
 * location), or zone (older clients; matches by zone only, without distance). Workers come nearest
 * first with distanceKm.
 */
export const GET = api(async (req, { ctx }) => {
  await enforceRateLimit(`search:${clientIp(req)}`, LIMITS.searchPerIp);
  const q = new URL(req.url).searchParams;
  const answers: Record<string, string> = {};
  q.forEach((v, k) => {
    if (k.startsWith('a.')) answers[k.slice(2)] = v;
  });
  const gender = q.get('gender');
  const res = await searchAvailableWorkers(ctx, {
    serviceSlug: q.get('service') ?? '',
    citySlug: q.get('city') ?? '',
    zoneId: q.get('zone') || undefined,
    localityId: q.get('loc') || undefined,
    lat: q.get('lat') ? Number(q.get('lat')) : undefined,
    lng: q.get('lng') ? Number(q.get('lng')) : undefined,
    date: q.get('date') ?? '',
    time: q.get('time') ?? '',
    durationMinutes: Number(q.get('duration') ?? 0),
    answers,
    workerGender: gender === 'female' || gender === 'male' ? gender : null,
    page: Number(q.get('page') ?? 1),
  });
  return {
    live: res.live,
    quote: res.quote ? { lines: res.quote.customer.lines, totalPaise: res.quote.customer.totalPaise, pricingVersion: res.quote.pricingVersion } : null,
    workers: res.workers.slice(0, 20),
    hasMore: res.workers.length > 20,
  };
});
