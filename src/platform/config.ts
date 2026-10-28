import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { configValues } from './db/platform-schema';
import type { Tx } from './db/client';

/**
 * Business configuration with code defaults. Values in `config_values` override defaults,
 * most specific scope first (service, then city, then global). See docs/decisions.md.
 */
const DEFS = {
  'booking.payment_hold_minutes': { schema: z.number().int().min(5).max(60), fallback: 15 },
  'booking.start_window': {
    schema: z.object({ beforeMinutes: z.number().int().min(0), afterMinutes: z.number().int().min(0) }),
    fallback: { beforeMinutes: 60, afterMinutes: 120 },
  },
  'booking.otp_max_attempts': { schema: z.number().int().min(3).max(10), fallback: 5 },
  'quality.low_rating_threshold': { schema: z.number().int().min(1).max(5), fallback: 2 },
  'payouts.dispute_window_hours': { schema: z.number().int().min(0), fallback: 48 },
  'booking.lead_time_minutes': {
    schema: z.object({ direct: z.number().int().min(0), assisted: z.number().int().min(0) }),
    fallback: { direct: 180, assisted: 1440 },
  },
  'quote.validity_hours': { schema: z.number().int().min(1).max(168), fallback: 48 },
  /** Minutes of business time before a new request must get its first response. */
  'request.first_response_minutes': { schema: z.number().int().min(15).max(2880), fallback: 120 },
  /** IST working window; weekdays 0 = Monday. */
  business_hours: {
    schema: z.object({
      startMinute: z.number().int().min(0).max(1439),
      endMinute: z.number().int().min(1).max(1440),
      weekdays: z.array(z.number().int().min(0).max(6)).min(1),
    }),
    fallback: { startMinute: 540, endMinute: 1140, weekdays: [0, 1, 2, 3, 4, 5] },
  },
} as const;

export type ConfigKey = keyof typeof DEFS;
type ConfigValue<K extends ConfigKey> = z.infer<(typeof DEFS)[K]['schema']>;

export async function getConfig<K extends ConfigKey>(
  tx: Tx,
  key: K,
  scope: { citySlug?: string; serviceSlug?: string } = {},
): Promise<ConfigValue<K>> {
  const scopes = [
    scope.serviceSlug ? `service:${scope.serviceSlug}` : null,
    scope.citySlug ? `city:${scope.citySlug}` : null,
    'global',
  ].filter((s): s is string => !!s);
  const rows = await tx
    .select({ scope: configValues.scope, value: configValues.value })
    .from(configValues)
    .where(and(eq(configValues.key, key), inArray(configValues.scope, scopes)));
  const def = DEFS[key];
  for (const s of scopes) {
    const row = rows.find((r) => r.scope === s);
    if (row) {
      const parsed = def.schema.safeParse(row.value);
      if (parsed.success) return parsed.data as ConfigValue<K>;
    }
  }
  return def.fallback as ConfigValue<K>;
}

export const CONFIG_DEFAULTS = Object.fromEntries(Object.entries(DEFS).map(([k, v]) => [k, v.fallback]));
