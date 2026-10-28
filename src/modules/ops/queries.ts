import { sql } from 'drizzle-orm';
import { withDb, type Ctx } from '@/platform/db/client';
import { requirePermission, can } from '@/platform/auth/permissions';
import { bookingLedgerSummary } from '../payments/ledger';

/** Operations overview (M18). Every figure is a live count from stored data. */
export async function opsOverview(ctx: Ctx) {
  requirePermission(ctx, 'booking.read_all');
  return withDb(ctx, async (tx) => {
    const [row] = await tx.execute<{
      pending_docs: number;
      applications: number;
      applicants: number;
      active_workers: number;
      pending_payment: number;
      confirmed: number;
      in_progress: number;
      completed_7d: number;
      open_flags: number;
      open_reports: number;
      waitlist: number;
      open_requests: number;
      unanswered_requests: number;
      overdue_requests: number;
      needs_people: number;
    }>(sql`
      select
        (select count(*)::int from worker_documents where status = 'pending') as pending_docs,
        (select count(*)::int from worker_service_approvals where status = 'applied') as applications,
        (select count(*)::int from worker_profiles where status = 'applicant') as applicants,
        (select count(*)::int from worker_profiles where status = 'active') as active_workers,
        (select count(*)::int from bookings where status = 'pending_payment') as pending_payment,
        (select count(*)::int from bookings where status = 'confirmed') as confirmed,
        (select count(*)::int from bookings where status = 'in_progress') as in_progress,
        (select count(*)::int from bookings where status = 'completed' and completed_at > now() - interval '7 days') as completed_7d,
        (select count(*)::int from moderation_flags where status = 'open') as open_flags,
        (select count(*)::int from reports where status = 'open') as open_reports,
        (select count(*)::int from waitlist_entries) as waitlist,
        (select count(*)::int from service_requests where status in ('submitted','in_review','sourcing','quoted')) as open_requests,
        (select count(*)::int from service_requests where status = 'submitted') as unanswered_requests,
        (select count(*)::int from service_requests where status = 'submitted' and first_response_due_at < now()) as overdue_requests,
        (select count(*)::int from bookings b where b.status in ('pending_payment','confirmed')
           and (select count(*) from booking_assignments a where a.booking_id = b.id and a.status = 'active') < b.workers_needed) as needs_people`);
    return row!;
  });
}

export async function bookingLedgerForStaff(ctx: Ctx, bookingId: string) {
  if (!can(ctx, 'ledger.read_all')) return null;
  return withDb(ctx, (tx) => bookingLedgerSummary(tx, bookingId));
}
