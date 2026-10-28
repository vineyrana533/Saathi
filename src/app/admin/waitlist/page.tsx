import { waitlistDemand } from '@/modules/seo/service';
import { listEnquiries } from '@/modules/requests/service';
import { can } from '@/platform/auth/permissions';
import { formatIst } from '@/platform/time';
import { EmptyState, Notice, Pill } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';

/** Section 17 waitlist demand, plus requests for work that isn't a listed service. */
export default async function WaitlistPage() {
  const { ctx } = await requireAnyRole(STAFF, '/admin/waitlist');
  if (!can(ctx, 'waitlist.read')) return <Notice tone="warning">Your role cannot view the waitlist.</Notice>;
  const [rows, requests] = await Promise.all([waitlistDemand(ctx), listEnquiries(ctx)]);
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Waitlist and requests</h1>

      <section className="mt-8" aria-labelledby="requests">
        <h2 id="requests" className="font-display text-h2 font-bold">
          Requests for other work ({requests.length})
        </h2>
        <p className="mt-1 text-small text-ink-2">
          From the &ldquo;something else&rdquo; form. Call back to scope the job. Status updates and quotes come with assisted matching in Milestone 2.
        </p>
        {requests.length === 0 ? (
          <EmptyState title="No requests yet" body="Requests appear here when someone asks for work that isn't a listed service." />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {requests.map((r) => (
              <li key={r.id} className="grid gap-2 border-b border-rule py-4 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-small tabular text-ink-2">{r.phoneE164}</p>
                  <p className="text-small text-ink-2">
                    {r.city}
                    {r.wantedOn ? `, wanted ${r.wantedOn}` : ''}
                  </p>
                </div>
                <p className="lg:col-span-7">{r.need}</p>
                <div className="flex flex-col items-start gap-1 lg:col-span-2 lg:items-end">
                  <Pill tone={r.status === 'needs_review' ? 'danger' : r.status === 'new' ? 'warning' : 'neutral'}>{r.status.replace('_', ' ')}</Pill>
                  <span className="text-small text-ink-3">{formatIst(r.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="waitlist">
        <h2 id="waitlist" className="font-display text-h2 font-bold">
          Waitlist demand
        </h2>
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
      </section>
    </>
  );
}
