import { waitlistDemand } from '@/modules/seo/service';
import { can } from '@/platform/auth/permissions';
import { formatIst } from '@/platform/time';
import { EmptyState, Notice } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';

/** Section 17: waitlist demand by city and service, to decide where to recruit. */
export default async function WaitlistPage() {
  const { ctx } = await requireAnyRole(STAFF, '/admin/waitlist');
  if (!can(ctx, 'waitlist.read')) return <Notice tone="warning">Your role cannot view the waitlist.</Notice>;
  const rows = await waitlistDemand(ctx);
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Waitlist demand</h1>
      {rows.length === 0 ? (
        <EmptyState title="No waitlist entries yet" body="Entries appear when people ask for a service in a city that isn't live." />
      ) : (
        <table className="mt-6 w-full text-left">
          <thead>
            <tr className="border-b border-ink text-small">
              <th className="py-2">City</th>
              <th className="py-2">Service</th>
              <th className="py-2 text-right">Entries</th>
              <th className="py-2 text-right">Latest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.city}-${r.service}`} className="border-b border-rule">
                <td className="py-3">{r.city}</td>
                <td className="py-3">{r.service}</td>
                <td className="py-3 text-right tabular">{r.entries}</td>
                <td className="py-3 text-right">{formatIst(new Date(r.latest))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
