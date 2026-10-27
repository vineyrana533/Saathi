import { sql } from 'drizzle-orm';
import { systemCtx, withDb } from './db/client';
import { tooMany } from './errors';

/**
 * Fixed-window rate limit stored in Postgres so limits hold across serverless instances.
 * Each check runs in its own short transaction, so the count survives even when the
 * caller's main transaction later rolls back (for example a wrong OTP). Defaults: decisions.md T-14.
 */
export const LIMITS = {
  otpRequestPerPhone: { limit: 3, windowSeconds: 600 },
  otpRequestPerIp: { limit: 10, windowSeconds: 3600 },
  otpVerifyPerPhone: { limit: 10, windowSeconds: 600 },
  bookingCreatePerUser: { limit: 10, windowSeconds: 3600 },
  searchPerIp: { limit: 60, windowSeconds: 60 },
  chatPerUser: { limit: 30, windowSeconds: 60 },
  waitlistPerIp: { limit: 5, windowSeconds: 3600 },
  otpEntryPerBooking: { limit: 10, windowSeconds: 600 },
} as const;

export type RateRule = { limit: number; windowSeconds: number };

export async function enforceRateLimit(key: string, rule: RateRule) {
  const count = await withDb(systemCtx(), async (tx) => {
    const rows = await tx.execute<{ count: number }>(sql`
      insert into rate_limits (key, window_start, count)
      values (${key}, to_timestamp(floor(extract(epoch from now()) / ${rule.windowSeconds}) * ${rule.windowSeconds}), 1)
      on conflict (key, window_start) do update set count = rate_limits.count + 1
      returning count`);
    return Number(rows[0]?.count ?? 0);
  });
  if (count > rule.limit) throw tooMany();
}
