/**
 * Local and staging seed. Refuses to run in production.
 * - Reference data: cities, zones, services, configs, flags, business defaults.
 * - Test accounts on the DEV_TEST_PHONES list (fixed OTP 123456 outside production):
 *     +91 90000 00001  admin, ops, verifier, finance
 *     +91 90000 00002  customer
 *     +91 90000 00003  worker (verified driver in South Delhi)
 * - Twelve clearly labelled sample drivers across Delhi NCR so the Delhi pages pass the
 *   go-live threshold in staging. Their names say "Sample". They hold no real documents.
 */
import { eq, sql } from 'drizzle-orm';
import { systemCtx, withDb, closeDb, type Tx } from '../src/platform/db/client';
import { seedCatalog } from '../src/modules/catalog/seed';
import { cities, zones } from '../src/modules/geo/schema';
import { services } from '../src/modules/catalog/schema';
import { consents, userRoles, users, type Role } from '../src/modules/identity/schema';
import { workerDocuments, workerProfiles, workerServiceApprovals, workerWeeklyHours, workerZones } from '../src/modules/workers/schema';
import { CONSENT_VERSIONS } from '../src/modules/identity/service';

if (process.env.APP_ENV === 'production') {
  console.error('Refusing to seed production');
  process.exit(1);
}

async function user(tx: Tx, phone: string, name: string, roles: Role[]) {
  await tx.insert(users).values({ phoneE164: phone, phoneVerifiedAt: sql`now()`, displayName: name }).onConflictDoNothing();
  const [u] = await tx.select().from(users).where(eq(users.phoneE164, phone));
  for (const role of roles) await tx.insert(userRoles).values({ userId: u!.id, role }).onConflictDoNothing();
  return u!;
}

async function driver(tx: Tx, phone: string, name: string, zoneIds: string[], gender: 'female' | 'male', serviceId: string) {
  const u = await user(tx, phone, name, ['worker']);
  const existing = await tx.select().from(workerProfiles).where(eq(workerProfiles.userId, u.id));
  if (existing.length) return;
  const nextYear = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
  const [wp] = await tx
    .insert(workerProfiles)
    .values({
      userId: u.id, displayName: name, bio: 'Sample profile for staging. Not a real person.', languages: ['Hindi', 'English'],
      gender, yearsExperience: 3 + (phone.charCodeAt(phone.length - 1) % 9), status: 'active', kycStatus: 'verified',
      kycProviderRef: 'seed:sample', idNumberMasked: 'XXXX-XXXX-0000', photoStatus: 'approved',
    })
    .returning();
  await tx.insert(workerDocuments).values([
    { workerId: wp!.id, docType: 'driving_licence', status: 'approved', numberMasked: 'XXXX-XXXX-0000', expiresOn: nextYear, attributes: { vehicle_classes: ['LMV'] }, reviewNote: 'Seed sample, no file' },
    { workerId: wp!.id, docType: 'police_certificate', status: 'approved', issuedOn: new Date().toISOString().slice(0, 10), expiresOn: nextYear, reviewNote: 'Seed sample, no file' },
    { workerId: wp!.id, docType: 'id_proof', status: 'approved', numberMasked: 'XXXX-XXXX-0000', reviewNote: 'Seed sample, no file' },
  ]);
  await tx.insert(workerServiceApprovals).values({ workerId: wp!.id, serviceId, status: 'approved' });
  await tx.insert(workerZones).values(zoneIds.map((zoneId) => ({ workerId: wp!.id, zoneId })));
  await tx.insert(workerWeeklyHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ workerId: wp!.id, weekday, startMinute: 7 * 60, endMinute: 22 * 60 })));
}

async function main() {
  await withDb(systemCtx(), async (tx) => {
    await seedCatalog(tx);
    const [svc] = await tx.select().from(services).where(eq(services.slug, 'personal-driver'));
    const ncr = await tx.select({ id: zones.id, city: cities.slug }).from(zones).innerJoin(cities, eq(cities.id, zones.cityId));
    const zonesOf = (slug: string) => ncr.filter((z) => z.city === slug).map((z) => z.id);

    await user(tx, '+919000000001', 'Test Admin', ['admin', 'ops', 'verifier', 'finance']);
    const customer = await user(tx, '+919000000002', 'Test Customer', ['customer']);
    await tx.insert(consents).values({ userId: customer.id, purpose: 'code_of_conduct', version: CONSENT_VERSIONS.code_of_conduct }).onConflictDoNothing();
    await driver(tx, '+919000000003', 'Test Driver', zonesOf('delhi').slice(0, 3), 'male', svc!.id);

    const all = [...zonesOf('delhi'), ...zonesOf('noida'), ...zonesOf('gurugram')];
    for (let i = 1; i <= 12; i++) {
      const phone = `+9190000001${String(i).padStart(2, '0')}`;
      await driver(tx, phone, `Sample Driver ${String(i).padStart(2, '0')}`, all, i % 3 === 0 ? 'female' : 'male', svc!.id);
    }
  });
  console.log('Seeded reference data, test accounts and 12 labelled sample drivers.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
