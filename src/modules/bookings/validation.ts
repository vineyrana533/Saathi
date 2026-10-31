import { z } from 'zod';
import type { ServiceConfig } from '../catalog/config';
import { fromIst, istParts } from '@/platform/time';
import { invalid } from '@/platform/errors';
import { scanText, explainBlock } from '../chat/moderation';

const answerValue = z.union([z.string().max(300), z.number(), z.boolean()]);
const blank = (v: unknown) => (v === '' || v === null ? undefined : v);
/** Optional id from a form or query string, where "not given" arrives as an empty string. */
export const optionalUuid = z.preprocess(blank, z.string().uuid().optional());
/** Optional coordinate from a form or query string. */
export const optionalCoord = (min: number, max: number) => z.preprocess((v) => (blank(v) === undefined ? undefined : Number(v)), z.number().min(min).max(max).optional());

/** Where the job is: a locality, a phone location, or (older API clients) a zone. Resolved by geo/location.ts. */
export const jobLocationInput = {
  zoneId: optionalUuid,
  localityId: optionalUuid,
  lat: optionalCoord(6, 38),
  lng: optionalCoord(68, 98),
};

export const slotInput = z.object({
  serviceSlug: z.string().min(1).max(60),
  citySlug: z.string().min(1).max(60),
  ...jobLocationInput,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a start time'),
  durationMinutes: z.coerce.number().int().positive(),
  answers: z.record(z.string(), answerValue).default({}),
});
export type SlotInput = z.infer<typeof slotInput>;

export const createBookingInput = slotInput.extend({
  workerId: z.string().uuid(),
  addressLine: z.string().trim().min(5, 'Enter the pickup address').max(200),
  landmark: z.string().trim().max(100).optional(),
  expectedTotalPaise: z.coerce.number().int().nonnegative(),
});
export type CreateBookingInput = z.infer<typeof createBookingInput>;

export interface ValidatedSlot {
  startsAt: Date;
  endsAt: Date;
  answers: Record<string, string | number | boolean>;
}

/** Applies the service's configured rules to a requested slot. Throws a field-level error. */
export function validateSlot(config: ServiceConfig, input: SlotInput, now = new Date()): ValidatedSlot {
  const d = config.durationMinutes;
  if (input.durationMinutes < d.min || input.durationMinutes > d.max || input.durationMinutes % d.step !== 0) {
    throw invalid('invalid_duration', `Choose between ${d.min / 60} and ${d.max / 60} hours`, { field: 'durationMinutes' });
  }
  let startsAt: Date;
  try {
    startsAt = fromIst(input.date, input.time);
  } catch {
    throw invalid('invalid_time', 'Pick a valid date and time', { field: 'date' });
  }
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
  const minStart = now.getTime() + config.leadTimeMinutes * 60_000;
  if (startsAt.getTime() < minStart) {
    throw invalid('too_soon', `Bookings need at least ${config.leadTimeMinutes / 60} hours notice`, { field: 'time' });
  }
  if (startsAt.getTime() > now.getTime() + config.maxAdvanceDays * 86_400_000) {
    throw invalid('too_far', `You can book up to ${config.maxAdvanceDays} days ahead`, { field: 'date' });
  }
  const s = istParts(startsAt);
  const e = istParts(endsAt);
  const endMinute = e.date === s.date ? e.minuteOfDay : e.minuteOfDay === 0 ? 1440 : -1;
  if (s.minuteOfDay < config.allowedHours.startMinute || endMinute < 0 || endMinute > config.allowedHours.endMinute) {
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    throw invalid(
      'outside_hours',
      `This service runs between ${fmt(config.allowedHours.startMinute)} and ${fmt(config.allowedHours.endMinute)}`,
      { field: 'time' },
    );
  }

  const answers: Record<string, string | number | boolean> = {};
  for (const q of config.questions) {
    const v = input.answers[q.id];
    const empty = v === undefined || v === '' || v === null;
    if (empty) {
      if (q.required) throw invalid('missing_answer', `Answer: ${q.label}`, { field: `answers.${q.id}` });
      continue;
    }
    switch (q.type) {
      case 'select':
        if (!q.options?.some((o) => o.value === String(v))) throw invalid('invalid_answer', `Pick an option for: ${q.label}`, { field: `answers.${q.id}` });
        answers[q.id] = String(v);
        break;
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) throw invalid('invalid_answer', `Enter a number for: ${q.label}`, { field: `answers.${q.id}` });
        answers[q.id] = n;
        break;
      }
      case 'boolean':
        answers[q.id] = v === true || v === 'true' || v === 'on';
        break;
      case 'text': {
        const text = String(v).slice(0, q.maxLength ?? 300);
        const scan = scanText(text);
        if (scan.action === 'block') throw invalid('answer_blocked', explainBlock(scan.reasons), { field: `answers.${q.id}` });
        answers[q.id] = text;
        break;
      }
    }
  }
  return { startsAt, endsAt, answers };
}

export function assertCleanAddress(addressLine: string, landmark?: string) {
  for (const [field, text] of [['addressLine', addressLine], ['landmark', landmark ?? '']] as const) {
    if (!text) continue;
    const scan = scanText(text);
    if (scan.action === 'block') {
      throw invalid('address_blocked', 'Remove phone numbers, links or contact handles from the address. Your worker can reach you through Saathi.', { field });
    }
  }
}
