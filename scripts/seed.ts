/**
 * Local and staging seed. Refuses to run in production.
 * - Reference data: cities, zones, services, configs, flags, business defaults.
 * - Test accounts on the DEV_TEST_PHONES list (fixed OTP 123456 outside production):
 *     +91 90000 00001  admin, ops, verifier, finance
 *     +91 90000 00002  customer, with a verified ID so in-home services can be booked
 *     +91 90000 00003  worker (verified driver in South Delhi)
 * - Twelve clearly labelled sample workers per service across Delhi NCR, so every Delhi NCR
 *   page passes the go-live threshold in staging. Their names say "Sample". They hold no real
 *   documents and cannot sign in.
 */
import { eq, sql } from 'drizzle-orm';
import { systemCtx, withDb, closeDb, type Tx } from '../src/platform/db/client';
import { seedCatalog } from '../src/modules/catalog/seed';
import { cities, zones } from '../src/modules/geo/schema';
import { services } from '../src/modules/catalog/schema';
import { consents, customerIdChecks, userRoles, users, type Role } from '../src/modules/identity/schema';
import { workerDocuments, workerProfiles, workerServiceApprovals, workerWeeklyHours, workerZones } from '../src/modules/workers/schema';
import { CONSENT_VERSIONS } from '../src/modules/identity/service';

if (process.env.APP_ENV === 'production') {
  console.error('Refusing to seed production');
  process.exit(1);
}

type SampleDoc = Omit<typeof workerDocuments.$inferInsert, 'workerId' | 'status' | 'reviewNote'>;

const nextYear = () => new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

/** The documents each service needs on top of ID, police certificate and photo. */
const SERVICE_DOCS: Record<string, () => SampleDoc[]> = {
  'personal-driver': () => [{ docType: 'driving_licence', numberMasked: 'XXXX-XXXX-0000', expiresOn: nextYear(), attributes: { vehicle_classes: ['LMV'] } }],
  'event-staff': () => [],
  errands: () => [],
  'elder-care': () => [{ docType: 'caregiver_training', issuedOn: today() }, { docType: 'first_aid_certificate', issuedOn: today() }],
  'domestic-help': () => [],
  'medical-support': () => [
    { docType: 'nursing_registration', numberMasked: 'XXXX-XXXX-0000', expiresOn: nextYear() },
    { docType: 'medical_qualification', issuedOn: today() },
  ],
};

/** Phone prefix (+91 9000000Xnn) and display name for each service's sample workers. */
const SAMPLES = [
  { service: 'personal-driver', prefix: '+9190000001', label: 'Sample Driver' },
  { service: 'event-staff', prefix: '+9190000002', label: 'Sample Event Staff' },
  { service: 'errands', prefix: '+9190000003', label: 'Sample Errand Helper' },
  { service: 'elder-care', prefix: '+9190000004', label: 'Sample Caregiver' },
  { service: 'domestic-help', prefix: '+9190000005', label: 'Sample Home Helper' },
  { service: 'medical-support', prefix: '+9190000006', label: 'Sample Nurse' },
] as const;

async function user(tx: Tx, phone: string, name: string, roles: Role[]) {
  await tx.insert(users).values({ phoneE164: phone, phoneVerifiedAt: sql`now()`, displayName: name }).onConflictDoNothing();
  const [u] = await tx.select().from(users).where(eq(users.phoneE164, phone));
  for (const role of roles) await tx.insert(userRoles).values({ userId: u!.id, role }).onConflictDoNothing();
  return u!;
}

async function sampleWorker(tx: Tx, phone: string, name: string, zoneIds: string[], gender: 'female' | 'male', serviceSlug: string) {
  const u = await user(tx, phone, name, ['worker']);
  const existing = await tx.select().from(workerProfiles).where(eq(workerProfiles.userId, u.id));
  if (existing.length) return;
  const [svc] = await tx.select().from(services).where(eq(services.slug, serviceSlug));
  const [wp] = await tx
    .insert(workerProfiles)
    .values({
      userId: u.id, displayName: name, bio: 'Sample profile for staging. Not a real person.', languages: ['Hindi', 'English'],
      gender, yearsExperience: 3 + (phone.charCodeAt(phone.length - 1) % 9), status: 'active', kycStatus: 'verified',
      kycProviderRef: 'seed:sample', idNumberMasked: 'XXXX-XXXX-0000', photoStatus: 'approved',
    })
    .returning();
  const docs: SampleDoc[] = [
    { docType: 'police_certificate', issuedOn: today(), expiresOn: nextYear() },
    { docType: 'id_proof', numberMasked: 'XXXX-XXXX-0000' },
    ...SERVICE_DOCS[serviceSlug]!(),
  ];
  await tx.insert(workerDocuments).values(docs.map((d) => ({ ...d, workerId: wp!.id, status: 'approved', reviewNote: 'Seed sample, no file' })));
  await tx.insert(workerServiceApprovals).values({ workerId: wp!.id, serviceId: svc!.id, status: 'approved' });
  await tx.insert(workerZones).values(zoneIds.map((zoneId) => ({ workerId: wp!.id, zoneId })));
  await tx.insert(workerWeeklyHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ workerId: wp!.id, weekday, startMinute: 7 * 60, endMinute: 22 * 60 })));
}

async function main() {
  await withDb(systemCtx(), async (tx) => {
    await seedCatalog(tx);
    const ncr = await tx.select({ id: zones.id, city: cities.slug }).from(zones).innerJoin(cities, eq(cities.id, zones.cityId));
    const zonesOf = (slug: string) => ncr.filter((z) => z.city === slug).map((z) => z.id);

    await user(tx, '+919000000001', 'Test Admin', ['admin', 'ops', 'verifier', 'finance']);
    const customer = await user(tx, '+919000000002', 'Test Customer', ['customer']);
    await tx.insert(consents).values({ userId: customer.id, purpose: 'code_of_conduct', version: CONSENT_VERSIONS.code_of_conduct }).onConflictDoNothing();
    const [idCheck] = await tx.select({ id: customerIdChecks.id }).from(customerIdChecks).where(eq(customerIdChecks.userId, customer.id)).limit(1);
    if (!idCheck) {
      await tx.insert(customerIdChecks).values({
        userId: customer.id, idType: 'aadhaar', numberMasked: 'XXXX-XXXX-0000', status: 'approved', reviewedAt: sql`now()`, reviewNote: 'Seed sample, no file',
      });
    }
    await sampleWorker(tx, '+919000000003', 'Test Driver', zonesOf('delhi').slice(0, 3), 'male', 'personal-driver');

    const all = [...zonesOf('delhi'), ...zonesOf('noida'), ...zonesOf('gurugram')];
    for (const s of SAMPLES) {
      for (let i = 1; i <= 12; i++) {
        const nn = String(i).padStart(2, '0');
        await sampleWorker(tx, `${s.prefix}${nn}`, `${s.label} ${nn}`, all, i % 2 === 0 ? 'female' : 'male', s.service);
      }
    }
  });
  console.log(`Seeded reference data, test accounts and 12 labelled sample workers for each of ${SAMPLES.length} services.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
