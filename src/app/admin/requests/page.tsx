import Link from 'next/link';
import { listRequestsForOps, type OpsView } from '@/modules/requests/assisted';
import { can } from '@/platform/auth/permissions';
import { formatIst } from '@/platform/time';
import { EmptyState, Notice, Pagination, Pill, STATUS_TONE } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';

const VIEWS: [OpsView, string][] = [
  ['open', 'Open'],
  ['unanswered', 'Waiting for a first response'],
  ['mine', 'Mine'],
  ['all', 'All'],
];

export default async function AdminRequests({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireAnyRole(STAFF, '/admin/requests');
  if (!can(ctx, 'request.manage')) return <Notice tone="warning">Your role cannot work on requests. Ask an admin for the ops role.</Notice>;
  const sp = await searchParams;
  const view = (VIEWS.find(([v]) => v === sp.view)?.[0] ?? 'open') as OpsView;
  const res = await listRequestsForOps(ctx, { view, page: Number(sp.page) || 1 });
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Requests and quotes</h1>
      <p className="mt-2 text-ink-2 prose-measure">
        Customers asking for a team or a quote. Reply within 2 working hours (9 am to 7 pm, Monday to Saturday): take the request, find people, then send a quote. Quotes stay valid for 48 hours.
      </p>
      <nav aria-label="Request views" className="mt-6 flex flex-wrap gap-2">
        {VIEWS.map(([v, label]) => (
          <Link
            key={v}
            href={`/admin/requests?view=${v}`}
            aria-current={v === view ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-xs border px-4 text-small font-semibold ${v === view ? 'border-ink bg-ink text-ink-on-dark' : 'border-rule-strong hover:bg-paper-2'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {res.rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="No requests here" body="New requests from customers appear in Open and in Waiting for a first response." />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto" role="region" aria-label="Requests table" tabIndex={0}>
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-ink text-small">
                <th className="py-2">Ref</th>
                <th className="py-2">Job</th>
                <th className="py-2">When</th>
                <th className="py-2">Status</th>
                <th className="py-2">Owner</th>
                <th className="py-2">First response</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r) => (
                <tr key={r.id} className="border-b border-rule">
                  <td className="py-3">
                    <Link className="link font-semibold" href={`/admin/requests/${r.id}`}>
                      {r.ref}
                    </Link>
                  </td>
                  <td className="py-3">
                    {r.serviceName}, {r.workersNeeded} {r.workersNeeded === 1 ? 'person' : 'people'}
                    <span className="block text-small text-ink-2">
                      {r.zoneName}, {r.cityName}
                    </span>
                  </td>
                  <td className="py-3">{formatIst(r.startsAt)}</td>
                  <td className="py-3">
                    <Pill tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status.replace(/_/g, ' ')}</Pill>
                    {r.quoteStatus && <span className="block text-small text-ink-2">Quote: {r.quoteStatus.replace(/_/g, ' ')}</span>}
                  </td>
                  <td className="py-3">{r.ownerName ?? 'Nobody yet'}</td>
                  <td className="py-3">
                    {r.firstRespondedAt ? (
                      <span className="text-ink-2">Done {formatIst(r.firstRespondedAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
                    ) : r.overdue ? (
                      <Pill tone="danger">Overdue since {formatIst(r.firstResponseDueAt, { timeStyle: 'short' })}</Pill>
                    ) : (
                      <span>Due {formatIst(r.firstResponseDueAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={res.page} hasNext={res.hasNext} hrefFor={(p) => `/admin/requests?view=${view}&page=${p}`} />
    </>
  );
}
