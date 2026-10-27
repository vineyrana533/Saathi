import { sql, type SQL } from 'drizzle-orm';
import type { Tx } from '@/platform/db/client';
import type { ServiceConfig } from '../catalog/config';
import { istParts } from '@/platform/time';

/**
 * Eligibility and availability in one query: the single source of truth used by search
 * and re-checked inside the booking transaction. Must run with system visibility (asSystem),
 * because it reads documents and other customers' assignments; it returns public fields only.
 *
 * A worker is eligible for a slot only if ALL hold:
 *  - account active, worker profile active, KYC verified (if required)
 *  - approved for this service (approval is per service)
 *  - every required document approved and valid through the booking date (expired = invisible)
 *  - police certificate approved and valid (if required)
 *  - serves the booking zone
 *  - weekly hours cover the slot (IST) and no time off overlaps
 *  - no active assignment overlaps (including unexpired payment holds)
 *  - meets the minimum rating rule
 *  - the worker's customer-gender preference is satisfied
 */
export interface EligibilityParams {
  serviceId: string;
  config: ServiceConfig;
  cityId: string;
  zoneId: string | null;
  startsAt: Date;
  endsAt: Date;
  answers: Record<string, string | number | boolean>;
  workerId?: string;
  workerGender?: 'female' | 'male' | null;
  customerGender?: string | null;
  limit?: number;
  offset?: number;
}

export interface EligibleWorker {
  id: string;
  displayName: string;
  bio: string;
  languages: string[];
  gender: string | null;
  yearsExperience: number;
  ratingAvgX100: number;
  ratingCount: number;
  photoApproved: boolean;
}

export async function findEligibleWorkers(tx: Tx, p: EligibilityParams): Promise<EligibleWorker[]> {
  const start = istParts(p.startsAt);
  const end = istParts(p.endsAt);
  // Bookings never cross midnight IST (enforced by allowed hours); guard anyway.
  if (start.date !== end.date && end.minuteOfDay !== 0) return [];
  const endMinute = end.minuteOfDay === 0 && end.date !== start.date ? 1440 : end.minuteOfDay;

  const req = p.config.workerRequirements;
  const docChecks: SQL[] = req.documents.map((d) => {
    const answer = d.matchAnswer ? p.answers[d.matchAnswer.questionId] : undefined;
    if (d.matchAnswer && (answer === undefined || answer === '')) return sql` and false`;
    const match = d.matchAnswer
      ? sql` and (d.attributes -> ${d.matchAnswer.attribute}) ? ${String(answer)}`
      : sql``;
    return sql` and exists (
      select 1 from worker_documents d
      where d.worker_id = wp.id and d.doc_type = ${d.type} and d.status = 'approved'
        and (d.expires_on is null or d.expires_on >= ${end.date}::date) ${match})`;
  });
  const police = req.requirePoliceVerification
    ? sql` and exists (
        select 1 from worker_documents d
        where d.worker_id = wp.id and d.doc_type = 'police_certificate' and d.status = 'approved'
          and (d.expires_on is null or d.expires_on >= ${end.date}::date))`
    : sql``;
  const kyc = req.requireKyc ? sql` and wp.kyc_status = 'verified'` : sql``;
  const zone = p.zoneId
    ? sql` and exists (select 1 from worker_zones z where z.worker_id = wp.id and z.zone_id = ${p.zoneId})`
    : sql` and exists (select 1 from worker_zones z join zones zz on zz.id = z.zone_id where z.worker_id = wp.id and zz.city_id = ${p.cityId})`;
  const one = p.workerId ? sql` and wp.id = ${p.workerId}` : sql``;
  const gender = p.workerGender ? sql` and wp.gender = ${p.workerGender}` : sql``;
  const pref = sql` and (wp.customer_gender_preference = 'any' or wp.customer_gender_preference = ${p.customerGender ?? '__unknown__'})`;
  const rating = sql` and (wp.rating_count < ${req.minRating.afterCount} or wp.rating_avg_x100 >= ${Math.round(req.minRating.value * 100)})`;

  const rows = await tx.execute<{
    id: string;
    display_name: string;
    bio: string;
    languages: string[];
    gender: string | null;
    years_experience: number;
    rating_avg_x100: number;
    rating_count: number;
    photo_status: string;
  }>(sql`
    select wp.id, wp.display_name, wp.bio, wp.languages, wp.gender, wp.years_experience,
           wp.rating_avg_x100, wp.rating_count, wp.photo_status
    from worker_profiles wp
    join users u on u.id = wp.user_id and u.status = 'active'
    join worker_service_approvals a on a.worker_id = wp.id and a.service_id = ${p.serviceId} and a.status = 'approved'
    where wp.status = 'active'
      ${kyc} ${police} ${sql.join(docChecks, sql``)} ${zone} ${one} ${gender} ${pref} ${rating}
      and exists (
        select 1 from worker_weekly_hours h
        where h.worker_id = wp.id and h.weekday = ${start.weekday}
          and h.start_minute <= ${start.minuteOfDay} and h.end_minute >= ${endMinute})
      and not exists (
        select 1 from worker_time_off o
        where o.worker_id = wp.id and tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(${p.startsAt.toISOString()}::timestamptz, ${p.endsAt.toISOString()}::timestamptz, '[)'))
      and not exists (
        select 1 from booking_assignments ba
        join bookings b on b.id = ba.booking_id
        where ba.worker_id = wp.id and ba.status = 'active'
          and ba.slot && tstzrange(${p.startsAt.toISOString()}::timestamptz, ${p.endsAt.toISOString()}::timestamptz, '[)')
          and not (b.status = 'pending_payment' and b.hold_expires_at < now()))
    order by (wp.rating_count > 0) desc, wp.rating_avg_x100 desc, wp.years_experience desc, wp.id
    limit ${p.limit ?? 20} offset ${p.offset ?? 0}`);

  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    bio: r.bio,
    languages: r.languages,
    gender: r.gender,
    yearsExperience: Number(r.years_experience),
    ratingAvgX100: Number(r.rating_avg_x100),
    ratingCount: Number(r.rating_count),
    photoApproved: r.photo_status === 'approved',
  }));
}

/** Count of verified workers who could serve this service in this city on a given day (for go-live). */
export async function countVerifiedSupply(tx: Tx, p: { serviceId: string; config: ServiceConfig; cityId: string; onDate: string }) {
  const req = p.config.workerRequirements;
  const docChecks: SQL[] = req.documents.map(
    (d) => sql` and exists (
      select 1 from worker_documents d
      where d.worker_id = wp.id and d.doc_type = ${d.type} and d.status = 'approved'
        and (d.expires_on is null or d.expires_on >= ${p.onDate}::date))`,
  );
  const police = req.requirePoliceVerification
    ? sql` and exists (
        select 1 from worker_documents d
        where d.worker_id = wp.id and d.doc_type = 'police_certificate' and d.status = 'approved'
          and (d.expires_on is null or d.expires_on >= ${p.onDate}::date))`
    : sql``;
  const kyc = req.requireKyc ? sql` and wp.kyc_status = 'verified'` : sql``;
  const rows = await tx.execute<{ n: number }>(sql`
    select count(distinct wp.id)::int as n
    from worker_profiles wp
    join users u on u.id = wp.user_id and u.status = 'active'
    join worker_service_approvals a on a.worker_id = wp.id and a.service_id = ${p.serviceId} and a.status = 'approved'
    where wp.status = 'active' ${kyc} ${police} ${sql.join(docChecks, sql``)}
      and exists (select 1 from worker_zones z join zones zz on zz.id = z.zone_id where z.worker_id = wp.id and zz.city_id = ${p.cityId})`);
  return Number(rows[0]?.n ?? 0);
}
