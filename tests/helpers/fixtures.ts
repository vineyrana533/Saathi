import { randomInt, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';
import { systemCtx, withDb, type Ctx } from '@/platform/db/client';
import { seedCatalog, DRIVER_PRICING } from '@/modules/catalog/seed';
import { cities, zones } from '@/modules/geo/schema';
import { serviceCities, services } from '@/modules/catalog/schema';
import { userRoles, users, consents, sessions, type Role } from '@/modules/identity/schema';
import {
  workerDocuments,
  workerProfiles,
  workerServiceApprovals,
  workerWeeklyHours,
  workerZones,
} from '@/modules/workers/schema';
import { CONSENT_VERSIONS } from '@/modules/identity/service';
import { randomToken, sha256Hex } from '@/platform/crypto';
import { istParts } from '@/platform/time';

let seeded = false;
export async function ensureSeed() {
  if (seeded) return;
  await withDb(systemCtx(), (tx) => seedCatalog(tx));
  seeded = true;
}

/** Owner connection for test-only time travel (moving a booking start, expiring a document). */
export function ownerSql() {
  return postgres(process.env.DATABASE_URL_OWNER!, { max: 2, onnotice: () => {} });
}

export const randomPhone = () => `+919${String(randomInt(100_000_000, 999_999_999))}`;

export async function createUser(roles: Role[] = ['customer'], opts: { conduct?: boolean; gender?: string } = {}) {
  return withDb(systemCtx(), async (tx) => {
    const [u] = await tx
      .insert(users)
      .values({ phoneE164: randomPhone(), phoneVerifiedAt: sql`now()`, displayName: `Test ${roles[0]} ${randomInt(1000, 9999)}`, gender: opts.gender ?? null })
      .returning();
    for (const role of roles) await tx.insert(userRoles).values({ userId: u!.id, role });
    if (opts.conduct !== false) {
      await tx.insert(consents).values({ userId: u!.id, purpose: 'code_of_conduct', version: CONSENT_VERSIONS.code_of_conduct });
    }
    const ctx: Ctx = { userId: u!.id, roles, requestId: randomUUID() };
    return { user: u!, ctx };
  });
}

export async function createSessionToken(userId: string) {
  const token = randomToken();
  await withDb(systemCtx(), (tx) =>
    tx.insert(sessions).values({ userId, tokenHash: sha256Hex(token), expiresAt: sql`now() + interval '1 day'` }),
  );
  return token;
}

/** Creates an isolated city with one zone and a live personal-driver service there. */
export async function createTestCity(opts: { threshold?: number; status?: 'live' | 'waitlist' } = {}) {
  await ensureSeed();
  const slug = `testcity-${randomInt(100000, 999999)}`;
  return withDb(systemCtx(), async (tx) => {
    const [city] = await tx.insert(cities).values({ slug, name: `Test City ${slug.slice(-6)}`, state: 'Test', region: 'test', status: 'live' }).returning();
    const [zone] = await tx.insert(zones).values({ cityId: city!.id, slug: 'zone-a', name: 'Zone A' }).returning();
    const [zoneB] = await tx.insert(zones).values({ cityId: city!.id, slug: 'zone-b', name: 'Zone B' }).returning();
    const [svc] = await tx.select().from(services).where(eq(services.slug, 'personal-driver'));
    const [sc] = await tx
      .insert(serviceCities)
      .values({ serviceId: svc!.id, cityId: city!.id, status: opts.status ?? 'live', pricing: DRIVER_PRICING, goLiveMinWorkers: opts.threshold ?? 1 })
      .returning();
    return { city: city!, zone: zone!, zoneB: zoneB!, service: svc!, serviceCity: sc! };
  });
}

export interface DriverOpts {
  zoneIds: string[];
  status?: 'active' | 'applicant' | 'suspended';
  approved?: boolean;
  licenceExpiresOn?: string;
  vehicleClasses?: string[];
  gender?: 'female' | 'male';
}

/** A fully verified driver (unless options say otherwise), working 06:00 to 23:00 every day. */
export async function createDriver(o: DriverOpts) {
  await ensureSeed();
  const { user, ctx } = await createUser(['worker'], { conduct: true });
  return withDb(systemCtx(), async (tx) => {
    const [svc] = await tx.select().from(services).where(eq(services.slug, 'personal-driver'));
    const [wp] = await tx
      .insert(workerProfiles)
      .values({
        userId: user.id,
        displayName: `Driver ${randomInt(1000, 9999)}`,
        languages: ['Hindi', 'English'],
        gender: o.gender ?? 'male',
        yearsExperience: 5,
        status: o.status ?? 'active',
        kycStatus: 'verified',
        kycProviderRef: 'manual:test',
        photoStatus: 'approved',
      })
      .returning();
    const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
    await tx.insert(workerDocuments).values([
      { workerId: wp!.id, docType: 'driving_licence', status: 'approved', numberMasked: 'XXXX-XXXX-1234',
        expiresOn: o.licenceExpiresOn ?? nextYear, attributes: { vehicle_classes: o.vehicleClasses ?? ['LMV'] } },
      { workerId: wp!.id, docType: 'police_certificate', status: 'approved', issuedOn: istParts(new Date()).date, expiresOn: nextYear },
      { workerId: wp!.id, docType: 'id_proof', status: 'approved', numberMasked: 'XXXX-XXXX-9876' },
    ]);
    await tx.insert(workerServiceApprovals).values({ workerId: wp!.id, serviceId: svc!.id, status: o.approved === false ? 'applied' : 'approved' });
    await tx.insert(workerZones).values(o.zoneIds.map((zoneId) => ({ workerId: wp!.id, zoneId })));
    await tx.insert(workerWeeklyHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ workerId: wp!.id, weekday, startMinute: 360, endMinute: 1380 })));
    return { worker: wp!, user, ctx };
  });
}

/** A slot `days` ahead at the given IST time, valid for the personal driver config. */
export function slot(days = 2, time = '10:00') {
  const d = new Date(Date.now() + days * 86400_000);
  return { date: istParts(d).date, time };
}

export const DRIVER_ANSWERS = { vehicle_class: 'LMV', transmission: 'manual' };

export function bookingRequest(args: { citySlug: string; zoneId: string; workerId: string; expectedTotalPaise: number; days?: number; time?: string; durationMinutes?: number }) {
  return {
    serviceSlug: 'personal-driver',
    citySlug: args.citySlug,
    zoneId: args.zoneId,
    ...slot(args.days ?? 2, args.time ?? '10:00'),
    durationMinutes: args.durationMinutes ?? 240,
    answers: DRIVER_ANSWERS,
    workerId: args.workerId,
    addressLine: 'House 12, Test Lane',
    expectedTotalPaise: args.expectedTotalPaise,
  };
}

/** Price the server will charge for a driver booking at DRIVER_PRICING (₹250/h). */
export const driverTotal = (minutes = 240) => Math.round((DRIVER_PRICING.hourlyRatePaise! * minutes) / 60);

export async function staffCtx(roles: Role[]) {
  const { ctx } = await createUser(roles, { conduct: false });
  return ctx;
}
