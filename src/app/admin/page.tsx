import Link from 'next/link';
import { opsOverview } from '@/modules/ops/queries';
import { requireAnyRole, STAFF } from '../_lib/session';

export default async function AdminOverview() {
  const { ctx } = await requireAnyRole(STAFF, '/admin');
  const o = await opsOverview(ctx);
  const groups: { title: string; items: [string, number, string][] }[] = [
    {
      title: 'Verification',
      items: [
        ['Documents waiting for review', o.pending_docs, '/admin/verification'],
        ['Service applications', o.applications, '/admin/verification'],
        ['Applicants not yet active', o.applicants, '/admin/verification'],
        ['Active workers', o.active_workers, '/admin/workers?status=active'],
      ],
    },
    {
      title: 'Bookings',
      items: [
        ['Waiting for payment', o.pending_payment, '/admin/bookings?status=pending_payment'],
        ['Confirmed', o.confirmed, '/admin/bookings?status=confirmed'],
        ['In progress', o.in_progress, '/admin/bookings?status=in_progress'],
        ['Completed in the last 7 days', o.completed_7d, '/admin/bookings?status=completed'],
      ],
    },
    {
      title: 'Trust and demand',
      items: [
        ['Open moderation flags', o.open_flags, '/admin/moderation'],
        ['Open reports', o.open_reports, '/admin/moderation'],
        ['Waitlist entries', o.waitlist, '/admin/waitlist'],
      ],
    },
  ];
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Overview</h1>
      <p className="mt-2 text-ink-2">Live counts from the database. Nothing here is sample data.</p>
      <div className="mt-8 grid gap-10 lg:grid-cols-3">
        {groups.map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="eyebrow">
              {g.title}
            </h2>
            <ul className="mt-3 border-t border-ink">
              {g.items.map(([label, n, href]) => (
                <li key={label} className="border-b border-rule">
                  <Link href={href} className="flex min-h-12 items-center justify-between gap-4 py-2 hover:bg-paper-2">
                    <span>{label}</span>
                    <span className="font-display text-h3 font-bold tabular">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
