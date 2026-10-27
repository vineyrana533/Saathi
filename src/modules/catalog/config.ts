import { z } from 'zod';

/**
 * Per-service configuration (section 11 of the brief). Stored as JSON on `services.config`
 * and validated with this schema on every write and read, so adding a category is configuration.
 */
const minuteOfDay = z.number().int().min(0).max(24 * 60);

export const bookingQuestionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().min(1),
  help: z.string().optional(),
  type: z.enum(['select', 'text', 'number', 'boolean']),
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  maxLength: z.number().int().positive().optional(),
});
export type BookingQuestion = z.infer<typeof bookingQuestionSchema>;

export const DOCUMENT_TYPES = ['driving_licence', 'police_certificate', 'id_proof', 'selfie', 'profile_photo'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const requiredDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  /** Document attribute that must contain the customer's answer, e.g. licence vehicle classes must include the chosen class. */
  matchAnswer: z.object({ attribute: z.string(), questionId: z.string() }).optional(),
});

export const cancellationPolicySchema = z.object({
  freeBeforeHours: z.number().nonnegative(),
  lateFeeBps: z.number().int().min(0).max(10000),
  veryLateBeforeHours: z.number().nonnegative(),
  veryLateFeeBps: z.number().int().min(0).max(10000),
});
export type CancellationPolicy = z.infer<typeof cancellationPolicySchema>;

export const serviceConfigSchema = z
  .object({
    durationMinutes: z.object({
      min: z.number().int().positive(),
      max: z.number().int().positive(),
      step: z.number().int().positive(),
    }),
    leadTimeMinutes: z.number().int().nonnegative(),
    maxAdvanceDays: z.number().int().positive(),
    /** Local (Asia/Kolkata) window in which a booking may start and end. */
    allowedHours: z.object({ startMinute: minuteOfDay, endMinute: minuteOfDay }),
    workersRequired: z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
    location: z.object({
      mode: z.enum(['customer_address', 'public_venue_only']),
      travelRadiusKm: z.number().positive(),
      outstationAllowed: z.boolean(),
    }),
    questions: z.array(bookingQuestionSchema),
    workerRequirements: z.object({
      documents: z.array(requiredDocumentSchema),
      requirePoliceVerification: z.boolean(),
      requireKyc: z.boolean(),
      minRating: z.object({ value: z.number().min(0).max(5), afterCount: z.number().int().nonnegative() }),
    }),
    customerVerification: z.enum(['phone', 'id']),
    matching: z.enum(['customer_choice', 'auto', 'manual']),
    cancellationPolicy: cancellationPolicySchema,
    payment: z.enum(['prepay', 'deposit', 'pay_after']),
    safety: z.object({
      startOtp: z.boolean(),
      endOtp: z.boolean(),
      checkInIntervalMinutes: z.number().int().positive().nullable(),
      sos: z.boolean(),
      publicVenueOnly: z.boolean(),
    }),
  })
  .refine((c) => c.durationMinutes.min <= c.durationMinutes.max, 'min duration must not exceed max')
  .refine((c) => c.allowedHours.startMinute < c.allowedHours.endMinute, 'allowed hours must be a forward window')
  .refine((c) => c.workersRequired.min <= c.workersRequired.max, 'workers required min must not exceed max');
export type ServiceConfig = z.infer<typeof serviceConfigSchema>;

export const taxRuleSchema = z.object({
  code: z.string(),
  label: z.string(),
  base: z.enum(['service', 'commission', 'platform_fee']),
  rateBps: z.number().int().min(0).max(10000),
  /** Who bears the tax: added to the customer's total, or deducted from the worker's earning. */
  payer: z.enum(['customer', 'worker']),
});
export type TaxRule = z.infer<typeof taxRuleSchema>;

export const pricingConfigSchema = z.object({
  currency: z.literal('INR'),
  model: z.enum(['hourly', 'daily', 'fixed']),
  hourlyRatePaise: z.number().int().nonnegative().optional(),
  dailyRatePaise: z.number().int().nonnegative().optional(),
  fixedPaise: z.number().int().nonnegative().optional(),
  commissionBps: z.number().int().min(0).max(10000),
  platformFee: z.object({ bps: z.number().int().min(0).max(10000), flatPaise: z.number().int().nonnegative() }),
  taxes: z.array(taxRuleSchema),
  tdsBps: z.number().int().min(0).max(10000),
});
export type PricingConfig = z.infer<typeof pricingConfigSchema>;
