import { and, eq } from 'drizzle-orm';
import { serviceCategories, serviceCities, services } from './schema';
import { serviceConfigSchema, pricingConfigSchema, type PricingConfig, type ServiceConfig } from './config';
import { cities, localities, zones } from '../geo/schema';
import { LOCALITY_SEED } from '../geo/localities';
import { configValues, featureFlags } from '@/platform/db/platform-schema';
import type { Tx } from '@/platform/db/client';

/**
 * Reference data: launch cities, zones, categories by risk tier, service configs and
 * business defaults (section 16). Idempotent. Prices are placeholders pending sign-off (decisions.md P-03).
 */
export const CITY_SEED = [
  { slug: 'delhi', name: 'Delhi', state: 'Delhi', region: 'delhi-ncr', status: 'live',
    zones: ['South Delhi', 'Central Delhi', 'West Delhi', 'East Delhi', 'North Delhi', 'Dwarka'] },
  { slug: 'noida', name: 'Noida', state: 'Uttar Pradesh', region: 'delhi-ncr', status: 'live',
    zones: ['Sector 18', 'Sector 62', 'Sector 137', 'Greater Noida West'] },
  { slug: 'gurugram', name: 'Gurugram', state: 'Haryana', region: 'delhi-ncr', status: 'live',
    zones: ['Cyber City', 'Golf Course Road', 'Sohna Road', 'Sector 56'] },
  { slug: 'mumbai', name: 'Mumbai', state: 'Maharashtra', region: 'mumbai', status: 'configured',
    zones: ['Andheri', 'Bandra', 'Powai', 'Lower Parel', 'Malad'] },
] as const;

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const standardCancellation = { freeBeforeHours: 24, lateFeeBps: 5000, veryLateBeforeHours: 2, veryLateFeeBps: 10000 };

export const PERSONAL_DRIVER_CONFIG: ServiceConfig = serviceConfigSchema.parse({
  durationMinutes: { min: 240, max: 720, step: 60 },
  leadTimeMinutes: 180,
  maxAdvanceDays: 30,
  allowedHours: { startMinute: 6 * 60, endMinute: 23 * 60 },
  workersRequired: { min: 1, max: 10 },
  location: { mode: 'customer_address', travelRadiusKm: 40, outstationAllowed: false },
  questions: [
    { id: 'vehicle_class', label: 'What will they drive?', type: 'select', required: true,
      options: [{ value: 'LMV', label: 'Car, SUV or MUV (LMV licence)' }] },
    { id: 'transmission', label: 'Gearbox', type: 'select', required: true,
      options: [{ value: 'manual', label: 'Manual' }, { value: 'automatic', label: 'Automatic' }] },
    { id: 'trip_notes', label: 'Anything the driver should know?', help: 'Stops, parking, timings. No phone numbers.', type: 'text', required: false, maxLength: 300 },
  ],
  workerRequirements: {
    documents: [{ type: 'driving_licence', matchAnswer: { attribute: 'vehicle_classes', questionId: 'vehicle_class' } }],
    requirePoliceVerification: true,
    requireKyc: true,
    minRating: { value: 3.5, afterCount: 5 },
  },
  customerVerification: 'phone',
  matching: 'customer_choice',
  cancellationPolicy: standardCancellation,
  payment: 'prepay',
  safety: { startOtp: true, endOtp: true, checkInIntervalMinutes: null, sos: true, publicVenueOnly: false },
  highlights: [
    'A driver for your car, for the hours you book. Fuel, parking and tolls are yours to pay.',
    'Start and end codes, so the clock only runs while the driver is with you.',
    'Chat with your driver inside Saathi.',
  ],
});

const EVENT_STAFF_CONFIG: ServiceConfig = serviceConfigSchema.parse({
  durationMinutes: { min: 120, max: 720, step: 60 },
  leadTimeMinutes: 24 * 60,
  maxAdvanceDays: 90,
  allowedHours: { startMinute: 7 * 60, endMinute: 23 * 60 },
  workersRequired: { min: 1, max: 50 },
  location: { mode: 'customer_address', travelRadiusKm: 40, outstationAllowed: false },
  questions: [
    { id: 'role', label: 'Role needed', type: 'select', required: true, options: [
      { value: 'host', label: 'Host or usher' }, { value: 'registration', label: 'Registration desk' },
      { value: 'helper', label: 'Event helper' }, { value: 'promoter', label: 'Promoter' }] },
    { id: 'dress_code', label: 'Dress code', type: 'text', required: false, maxLength: 120 },
  ],
  workerRequirements: { documents: [], requirePoliceVerification: true, requireKyc: true, minRating: { value: 3.5, afterCount: 5 } },
  customerVerification: 'phone',
  matching: 'customer_choice',
  cancellationPolicy: standardCancellation,
  payment: 'prepay',
  safety: { startOtp: true, endOtp: true, checkInIntervalMinutes: null, sos: true, publicVenueOnly: false },
  highlights: [
    'Hosts, ushers, registration desk staff and helpers for events and offices.',
    'Book one person online, or ask for a quote for a team of up to 50.',
    'Start and end codes for every person on the job.',
  ],
});

const ERRANDS_CONFIG: ServiceConfig = serviceConfigSchema.parse({
  durationMinutes: { min: 120, max: 480, step: 60 },
  leadTimeMinutes: 180,
  maxAdvanceDays: 30,
  allowedHours: { startMinute: 7 * 60, endMinute: 21 * 60 },
  workersRequired: { min: 1, max: 5 },
  location: { mode: 'customer_address', travelRadiusKm: 25, outstationAllowed: false },
  questions: [
    { id: 'errand_type', label: 'What kind of help?', type: 'select', required: true, options: [
      { value: 'queue', label: 'Standing in a queue' }, { value: 'documents', label: 'Document run' },
      { value: 'shopping', label: 'Shopping help' }, { value: 'appointment', label: 'Going with someone to an appointment (non-medical help)' }] },
    { id: 'details', label: 'Details', type: 'text', required: false, maxLength: 300 },
  ],
  workerRequirements: { documents: [], requirePoliceVerification: true, requireKyc: true, minRating: { value: 3.5, afterCount: 5 } },
  customerVerification: 'phone',
  matching: 'customer_choice',
  cancellationPolicy: standardCancellation,
  payment: 'prepay',
  safety: { startOtp: true, endOtp: true, checkInIntervalMinutes: null, sos: true, publicVenueOnly: false },
  highlights: [
    'Standing in a queue, document runs and shopping help.',
    'Company at appointments, with non-medical help only.',
    'Start and end codes, so you pay only for the time booked.',
  ],
});

/** Tier B: built and configured, disabled behind a feature flag until the safety review (Milestone 6). */
const COMPANION_CONFIG: ServiceConfig = serviceConfigSchema.parse({
  durationMinutes: { min: 60, max: 240, step: 60 },
  leadTimeMinutes: 24 * 60,
  maxAdvanceDays: 30,
  allowedHours: { startMinute: 9 * 60, endMinute: 22 * 60 },
  workersRequired: { min: 1, max: 1 },
  location: { mode: 'public_venue_only', travelRadiusKm: 15, outstationAllowed: false },
  questions: [{ id: 'activity', label: 'Activity', type: 'select', required: true, options: [
    { value: 'shopping', label: 'Shopping' }, { value: 'coffee', label: 'Coffee' }, { value: 'movie', label: 'Movie' },
    { value: 'event', label: 'Event or function' }, { value: 'sightseeing', label: 'Sightseeing' }] }],
  workerRequirements: { documents: [], requirePoliceVerification: true, requireKyc: true, minRating: { value: 4, afterCount: 3 } },
  customerVerification: 'id',
  matching: 'manual',
  cancellationPolicy: standardCancellation,
  payment: 'prepay',
  safety: { startOtp: true, endOtp: true, checkInIntervalMinutes: 30, sos: true, publicVenueOnly: true },
});

/**
 * Tier C: in-home and medical work, bookable online since the owner's decision of 28 Oct 2026
 * (decisions.md T-31) while legal items L-11 to L-13 stay open. Each has its own feature flag as
 * the off switch. Every Tier C service requires a verified customer ID, police verification and KYC.
 */
const ELDER_CARE_CONFIG: ServiceConfig = serviceConfigSchema.parse({
  durationMinutes: { min: 240, max: 720, step: 60 },
  leadTimeMinutes: 24 * 60,
  maxAdvanceDays: 60,
  allowedHours: { startMinute: 7 * 60, endMinute: 21 * 60 },
  workersRequired: { min: 1, max: 1 },
  location: { mode: 'customer_address', travelRadiusKm: 15, outstationAllowed: false },
  questions: [
    { id: 'care_need', label: 'What help is needed?', type: 'select', required: true, options: [
      { value: 'company', label: 'Company and conversation' }, { value: 'routines', label: 'Help with daily routines' },
      { value: 'mobility', label: 'Help moving around the home' }] },
    { id: 'notes', label: 'Anything the caregiver should know?', help: 'Routines, mobility, languages. No medical instructions.', type: 'text', required: false, maxLength: 300 },
  ],
  workerRequirements: {
    documents: [{ type: 'caregiver_training' }, { type: 'first_aid_certificate' }],
    requirePoliceVerification: true,
    requireKyc: true,
    minRating: { value: 4, afterCount: 3 },
  },
  customerVerification: 'id',
  matching: 'customer_choice',
  cancellationPolicy: standardCancellation,
  payment: 'prepay',
  safety: { startOtp: true, endOtp: true, checkInIntervalMinutes: 120, sos: true, publicVenueOnly: false },
  highlights: [
    'Company and help with daily routines for an older family member at home.',
    'Help moving around the home safely. No medical tasks.',
    'Caregivers with training and first aid certificates, and police verification.',
  ],
});

const DOMESTIC_HELP_CONFIG: ServiceConfig = serviceConfigSchema.parse({
  durationMinutes: { min: 120, max: 480, step: 60 },
  leadTimeMinutes: 24 * 60,
  maxAdvanceDays: 60,
  allowedHours: { startMinute: 7 * 60, endMinute: 20 * 60 },
  workersRequired: { min: 1, max: 3 },
  location: { mode: 'customer_address', travelRadiusKm: 15, outstationAllowed: false },
  questions: [
    { id: 'task', label: 'What needs doing?', type: 'select', required: true, options: [
      { value: 'cleaning', label: 'Cleaning' }, { value: 'cooking', label: 'Cooking' },
      { value: 'laundry', label: 'Laundry and ironing' }, { value: 'mixed', label: 'A mix of these' }] },
    { id: 'notes', label: 'Anything else?', type: 'text', required: false, maxLength: 300 },
  ],
  workerRequirements: { documents: [], requirePoliceVerification: true, requireKyc: true, minRating: { value: 4, afterCount: 3 } },
  customerVerification: 'id',
  matching: 'customer_choice',
  cancellationPolicy: standardCancellation,
  payment: 'prepay',
  safety: { startOtp: true, endOtp: true, checkInIntervalMinutes: null, sos: true, publicVenueOnly: false },
  highlights: [
    'Cleaning, cooking, laundry and dishes in your home.',
    'Book by the hour, or ask for a regular schedule.',
    'Every person is police-verified before their first job.',
  ],
});

const MEDICAL_SUPPORT_CONFIG: ServiceConfig = serviceConfigSchema.parse({
  durationMinutes: { min: 240, max: 720, step: 60 },
  leadTimeMinutes: 24 * 60,
  maxAdvanceDays: 60,
  allowedHours: { startMinute: 7 * 60, endMinute: 21 * 60 },
  workersRequired: { min: 1, max: 1 },
  location: { mode: 'customer_address', travelRadiusKm: 15, outstationAllowed: false },
  questions: [
    { id: 'support_need', label: 'What support is needed?', type: 'select', required: true, options: [
      { value: 'medicines', label: 'Help with medicines' }, { value: 'dressings', label: 'Wound dressings' },
      { value: 'recovery', label: 'Recovery after a hospital stay' }, { value: 'other', label: 'Something else (our team will call)' }] },
  ],
  workerRequirements: {
    documents: [{ type: 'nursing_registration' }, { type: 'medical_qualification' }],
    requirePoliceVerification: true,
    requireKyc: true,
    minRating: { value: 4, afterCount: 3 },
  },
  customerVerification: 'id',
  matching: 'customer_choice',
  cancellationPolicy: standardCancellation,
  payment: 'prepay',
  safety: { startOtp: true, endOtp: true, checkInIntervalMinutes: 120, sos: true, publicVenueOnly: false },
  highlights: [
    'Care from registered nurses only, with their registration checked.',
    'Help with medicines, dressings and recovery after a hospital stay.',
    'Not for emergencies. In an emergency, call 112.',
  ],
});

export const DRIVER_PRICING: PricingConfig = pricingConfigSchema.parse({
  currency: 'INR',
  model: 'hourly',
  hourlyRatePaise: 25000,
  commissionBps: 2000,
  platformFee: { bps: 0, flatPaise: 0 },
  taxes: [{ code: 'GST_ON_COMMISSION', label: 'GST on commission (18%)', base: 'commission', rateBps: 1800, payer: 'worker' }],
  tdsBps: 0,
});

const HOURLY_PLACEHOLDER = (ratePaise: number): PricingConfig => ({ ...DRIVER_PRICING, hourlyRatePaise: ratePaise });

/** Delhi NCR is live; Mumbai stays on the waitlist until the city opens. */
const NCR_LIVE = { delhi: 'live', noida: 'live', gurugram: 'live', mumbai: 'waitlist' } as const;

const FLAG_SEED = [
  { key: 'category.social-companion', enabled: false, description: 'Tier B social companion category. Enable only after the Milestone 6 safety review and sign-off.' },
  { key: 'category.elder-care', enabled: true, description: 'Tier C elder care at home. Enabled by the owner on 28 Oct 2026 (decisions.md T-31); turn off to stop new bookings.' },
  { key: 'category.domestic-help', enabled: true, description: 'Tier C domestic help. Enabled by the owner on 28 Oct 2026 (decisions.md T-31); turn off to stop new bookings.' },
  { key: 'category.medical-support', enabled: true, description: 'Tier C home nursing. Enabled by the owner on 28 Oct 2026 (decisions.md T-31); turn off to stop new bookings.' },
];

const CATEGORY_SEED = [
  { slug: 'driving', name: 'Driving', riskTier: 'A', sortOrder: 1 },
  { slug: 'event-staff', name: 'Event and business staff', riskTier: 'A', sortOrder: 2 },
  { slug: 'errands', name: 'Errands and appointment help', riskTier: 'A', sortOrder: 3 },
  { slug: 'social-companion', name: 'Social companion (platonic)', riskTier: 'B', sortOrder: 4 },
  { slug: 'care', name: 'Care at home', riskTier: 'C', sortOrder: 5 },
  { slug: 'home-help', name: 'Help at home', riskTier: 'C', sortOrder: 6 },
] as const;

const SERVICE_SEED = [
  { slug: 'personal-driver', category: 'driving', name: 'Personal driver', riskTier: 'A', bookingMode: 'direct',
    summary: 'A verified driver for your own car, by the hour or for the day.', config: PERSONAL_DRIVER_CONFIG,
    status: 'active', featureFlagKey: null, pricing: DRIVER_PRICING,
    cityStatus: NCR_LIVE },
  { slug: 'event-staff', category: 'event-staff', name: 'Event and business staff', riskTier: 'A', bookingMode: 'both',
    summary: 'Hosts, ushers, registration desk staff and helpers for events and offices.', config: EVENT_STAFF_CONFIG,
    status: 'active', featureFlagKey: null, pricing: HOURLY_PLACEHOLDER(30000),
    cityStatus: NCR_LIVE },
  { slug: 'errands', category: 'errands', name: 'Errands and appointment help', riskTier: 'A', bookingMode: 'both',
    summary: 'Queues, document runs, shopping help, and company at appointments (non-medical).', config: ERRANDS_CONFIG,
    status: 'active', featureFlagKey: null, pricing: HOURLY_PLACEHOLDER(20000),
    cityStatus: NCR_LIVE },
  { slug: 'social-companion', category: 'social-companion', name: 'Social companion', riskTier: 'B', bookingMode: 'assisted',
    summary: 'Platonic company in public places only. Not available yet.', config: COMPANION_CONFIG,
    status: 'disabled', featureFlagKey: 'category.social-companion', pricing: HOURLY_PLACEHOLDER(30000),
    cityStatus: { delhi: 'waitlist' } },
  // Tier C prices are placeholders pending owner sign-off (decisions.md P-09); admins change them in the catalogue.
  { slug: 'elder-care', category: 'care', name: 'Elder care', riskTier: 'C', bookingMode: 'both',
    summary: 'A trained caregiver for an older family member at home: company, daily routines and moving around safely. Non-medical.',
    config: ELDER_CARE_CONFIG, status: 'active', featureFlagKey: 'category.elder-care', pricing: HOURLY_PLACEHOLDER(20000),
    cityStatus: NCR_LIVE },
  { slug: 'domestic-help', category: 'home-help', name: 'Domestic help', riskTier: 'C', bookingMode: 'both',
    summary: 'Help at home with cleaning, cooking, laundry and dishes, by the hour or on a regular schedule.',
    config: DOMESTIC_HELP_CONFIG, status: 'active', featureFlagKey: 'category.domestic-help', pricing: HOURLY_PLACEHOLDER(15000),
    cityStatus: NCR_LIVE },
  { slug: 'medical-support', category: 'care', name: 'Medical support at home', riskTier: 'C', bookingMode: 'both',
    summary: 'Home nursing by registered nurses: help with medicines, dressings and recovery after a hospital stay.',
    config: MEDICAL_SUPPORT_CONFIG, status: 'active', featureFlagKey: 'category.medical-support', pricing: HOURLY_PLACEHOLDER(35000),
    cityStatus: NCR_LIVE },
] as const;

export async function seedCatalog(tx: Tx) {
  for (const c of CITY_SEED) {
    await tx.insert(cities).values({ slug: c.slug, name: c.name, state: c.state, region: c.region, status: c.status }).onConflictDoNothing();
    const [city] = await tx.select().from(cities).where(eq(cities.slug, c.slug));
    for (const z of c.zones) {
      await tx.insert(zones).values({ cityId: city!.id, slug: slugify(z), name: z }).onConflictDoNothing();
      const [zone] = await tx.select().from(zones).where(and(eq(zones.cityId, city!.id), eq(zones.slug, slugify(z))));
      for (const [name, lat, lng] of LOCALITY_SEED[c.slug]?.[z] ?? []) {
        await tx.insert(localities).values({ cityId: city!.id, zoneId: zone!.id, slug: slugify(name), name, lat, lng }).onConflictDoNothing();
      }
    }
  }
  for (const cat of CATEGORY_SEED) {
    await tx.insert(serviceCategories).values(cat).onConflictDoNothing();
  }
  for (const flag of FLAG_SEED) {
    await tx.insert(featureFlags).values(flag).onConflictDoNothing();
  }

  for (const s of SERVICE_SEED) {
    const [cat] = await tx.select().from(serviceCategories).where(eq(serviceCategories.slug, s.category));
    // Reference content is refreshed on every seed; status is left alone once set (admins may change it).
    const content = { categoryId: cat!.id, name: s.name, summary: s.summary, riskTier: s.riskTier, bookingMode: s.bookingMode, config: s.config, featureFlagKey: s.featureFlagKey };
    await tx
      .insert(services)
      .values({ ...content, slug: s.slug, pricingModel: 'hourly', status: s.status })
      .onConflictDoUpdate({ target: services.slug, set: content });
    const [svc] = await tx.select().from(services).where(eq(services.slug, s.slug));
    for (const [citySlug, status] of Object.entries(s.cityStatus)) {
      const [city] = await tx.select().from(cities).where(eq(cities.slug, citySlug));
      const exists = await tx.select({ id: serviceCities.id }).from(serviceCities)
        .where(and(eq(serviceCities.serviceId, svc!.id), eq(serviceCities.cityId, city!.id)));
      if (!exists.length) {
        await tx.insert(serviceCities).values({ serviceId: svc!.id, cityId: city!.id, status, pricing: s.pricing, goLiveMinWorkers: 10 });
      }
    }
  }

  const defaults: { key: string; value: unknown; status: 'approved' | 'pending_signoff' | 'needs_legal'; note: string }[] = [
    { key: 'commission.default_bps', value: 2000, status: 'approved', note: 'Section 16, B-01' },
    { key: 'booking.min_minutes', value: { default: 120, 'personal-driver': 240 }, status: 'approved', note: 'B-02 (applied via service config)' },
    { key: 'booking.lead_time_minutes', value: { direct: 180, assisted: 1440 }, status: 'approved', note: 'B-03 (applied via service config)' },
    { key: 'cancellation.policy', value: standardCancellation, status: 'approved', note: 'B-04 to B-06' },
    { key: 'quote.validity_hours', value: 48, status: 'approved', note: 'B-08' },
    { key: 'payouts.dispute_window_hours', value: 48, status: 'approved', note: 'B-11' },
    { key: 'booking.payment_hold_minutes', value: 15, status: 'pending_signoff', note: 'T-11' },
    { key: 'booking.start_window', value: { beforeMinutes: 60, afterMinutes: 120 }, status: 'pending_signoff', note: 'T-13' },
    { key: 'seo.go_live_min_workers', value: 10, status: 'pending_signoff', note: 'P-01 (applied per service_cities.go_live_min_workers)' },
    { key: 'quality.low_rating_threshold', value: 2, status: 'pending_signoff', note: 'P-05' },
    { key: 'tax.gst_on_commission_bps', value: 1800, status: 'needs_legal', note: 'L-03' },
    { key: 'tax.tds_bps', value: 0, status: 'needs_legal', note: 'L-05' },
    { key: 'request.first_response_minutes', value: 120, status: 'pending_signoff', note: 'P-10 (business minutes)' },
    { key: 'booking.travel_gap_minutes', value: 60, status: 'pending_signoff', note: 'P-11 (gap between one person\'s jobs)' },
    { key: 'business_hours', value: { startMinute: 540, endMinute: 1140, weekdays: [0, 1, 2, 3, 4, 5] }, status: 'pending_signoff', note: 'P-10 (09:00 to 19:00 IST, Monday to Saturday)' },
  ];
  for (const d of defaults) {
    await tx.insert(configValues).values({ key: d.key, scope: 'global', value: d.value, status: d.status, note: d.note }).onConflictDoNothing();
  }
}
