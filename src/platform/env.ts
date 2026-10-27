import { z } from 'zod';

/**
 * Server-only environment. Parsed lazily so `next build` can run without secrets;
 * values are validated the first time they are used. Never import this from client components.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'test', 'staging', 'production']).default('local'),
  SITE_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().default('postgres://saathi_app:saathi_app_local@localhost:54329/saathi'),
  DATABASE_URL_OWNER: z.string().default('postgres://postgres:postgres@localhost:54329/saathi'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  OTP_PEPPER: z.string().min(16).default('local-dev-otp-pepper-change-me'),
  DOCUMENT_ENCRYPTION_KEY: z
    .string()
    .default(Buffer.from('local-dev-document-key-32-bytes!').toString('base64'))
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'DOCUMENT_ENCRYPTION_KEY must be 32 bytes, base64'),
  DOCUMENT_STORE: z.enum(['local-encrypted', 'supabase']).default('local-encrypted'),
  LOCAL_DOCUMENT_DIR: z.string().default('.local/documents'),
  PAYMENTS_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PAYMENTS_LIVE_APPROVED: z.enum(['true', 'false']).default('false'),
  SANDBOX_WEBHOOK_SECRET: z.string().min(8).default('local-sandbox-webhook-secret'),
  SMS_PROVIDER: z.enum(['dev-log']).default('dev-log'),
  DEV_TEST_PHONES: z
    .string()
    .default('+919000000001,+919000000002,+919000000003,+919000000004,+919000000005'),
  CRON_SECRET: z.string().min(8).default('local-cron-secret'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.parse(process.env);
    if (parsed.APP_ENV === 'production') {
      const mustBeExplicit = ['OTP_PEPPER', 'DOCUMENT_ENCRYPTION_KEY', 'SANDBOX_WEBHOOK_SECRET', 'CRON_SECRET', 'DATABASE_URL'] as const;
      for (const key of mustBeExplicit) {
        if (!process.env[key]) throw new Error(`${key} must be set explicitly in production`);
      }
      if (parsed.PAYMENTS_MODE === 'live' && parsed.PAYMENTS_LIVE_APPROVED !== 'true') {
        throw new Error('Live payments are blocked until gateway category approval is recorded (decisions.md V-01)');
      }
    }
    cached = parsed;
  }
  return cached;
}

/** Test hook: lets tests point at a throwaway database. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => env().APP_ENV === 'production';

/** Test phones get a fixed OTP, but never in production. */
export function isDevTestPhone(phone: string): boolean {
  if (isProduction()) return false;
  return env()
    .DEV_TEST_PHONES.split(',')
    .map((p) => p.trim())
    .includes(phone);
}
