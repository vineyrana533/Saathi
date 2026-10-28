import Link from 'next/link';
import { listWaitlistEntries, waitlistDemand } from '@/modules/seo/service';
import { listEnquiries } from '@/modules/requests/service';
import { can } from '@/platform/auth/permissions';
import { formatIst } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { EmptyState, Notice, Pagination, Pill } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';
import { setEnquiryStatusAction, setWaitlistStatusAction } from '../actions';

const TONE = { new: 'warning', needs_review: 'danger', contacted: 'success', closed: 'neutral' } as const;

/** Follow-ups for ops: waitlist sign-ups and "something else" requests, then demand totals. */
export default async function WaitlistPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireAnyRole(STAFF, '/admin/waitlist');
  if (!can(ctx, 'waitlist.read')) return <Notice tone="warning">Your role cannot view the waitlist.</Notice>;
  const sp = await searchParams;
  const status = sp.status === 'all' ? undefined : (sp.status ?? 'new');
  const [entries, requests, demand] = await Promise.all([
    listWaitlistEntries(ctx, { status, page: Number(sp.page) || 1 }),
    listEnquiries(ctx),
    waitlistDemand(ctx),
  ]);
  const canManage = can(ctx, 'waitlist.manage');
  const filterHref = (s: string) => `/admin/waitlist?status=${s}`;
  const openRequests = requests.filter((r) => r.status === 'new' || r.status === 'needs_review');

  return (
    <>
      <h1 className="font-display text-h1 font-bold">Waitlist and requests</h1>
      <p className="mt-2 text-ink-2">
        People who asked to be contacted. Call them, then mark them as contacted so nobody is called twice.
      </p>

      <section className="mt-8" aria-labelledby="signups">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="signups" className="font-display text-h2 font-bold">
            Waitlist sign-ups
          </h2>
          <nav aria-label="Filter sign-ups" className="flex gap-1 text-small font-semibold">
            {[
              ['new', 'New'],
              ['contacted', 'Contacted'],
              ['closed', 'Closed'],
              ['all', 'All'],
            ].map(([key, label]) => (
              <Link
                key={key}
                href={filterHref(key!)}
                aria-current={(status ?? 'all') === key ? 'page' : undefined}
                className="min-h-11 px-3 py-3 hover:bg-paper-2 aria-[current=page]:underline aria-[current=page]:underline-offset-4"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {entries.rows.length === 0 ? (
          <EmptyState title="Nothing here" body="Sign-ups appear when someone joins the waitlist on a service page that isn't open yet." />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {entries.rows.map((w) => (
              <li key={w.id} className="grid gap-3 border-b border-rule py-4 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <p className="font-semibold">{w.name}</p>
                  <a className="link tabular" href={`tel:${w.phoneE164}`}>
                    {w.phoneE164}
                  </a>
                  <p className="text-small text-ink-2">
                    {w.service}, {w.city}
                  </p>
                </div>
                <div className="lg:col-span-5">
                  <p>{w.need}</p>
                  <p className="mt-1 text-small text-ink-3">
                    {w.wantedOn ? `Wanted on ${w.wantedOn}. ` : ''}Signed up {formatIst(w.createdAt)}
                    {w.contactedAt ? `. Contacted ${formatIst(w.contactedAt)}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2 lg:col-span-4 lg:justify-end">
                  <Pill tone={TONE[w.status as keyof typeof TONE] ?? 'neutral'}>{w.status}</Pill>
                  {canManage && <StatusButtons id={w.id} status={w.status} action={setWaitlistStatusAction} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination page={entries.page} hasNext={entries.hasNext} hrefFor={(p) => `/admin/waitlist?status=${sp.status ?? 'new'}&page=${p}`} />
      </section>

      <section className="mt-12" aria-labelledby="requests">
        <h2 id="requests" className="font-display text-h2 font-bold">
          Requests for other work ({openRequests.length} open)
        </h2>
        <p className="mt-1 text-small text-ink-2">From the &ldquo;Tell us what you need&rdquo; form. &ldquo;needs review&rdquo; means the wording should be checked before calling.</p>
        {requests.length === 0 ? (
          <EmptyState title="No requests yet" body="Requests appear here when someone asks for work that isn't a listed service." />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {requests.map((r) => (
              <li key={r.id} className="grid gap-3 border-b border-rule py-4 lg:grid-cols-12">
                <div className="lg:col-span-3">
                  <p className="font-semibold">{r.name}</p>
                  <a className="link tabular" href={`tel:${r.phoneE164}`}>
                    {r.phoneE164}
                  </a>
                  <p className="text-small text-ink-2">
                    {r.city}
                    {r.wantedOn ? `, wanted ${r.wantedOn}` : ''}
                  </p>
                </div>
                <div className="lg:col-span-5">
                  <p>{r.need}</p>
                  <p className="mt-1 text-small text-ink-3">Sent {formatIst(r.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-start gap-2 lg:col-span-4 lg:justify-end">
                  <Pill tone={TONE[r.status as keyof typeof TONE] ?? 'neutral'}>{r.status.replace('_', ' ')}</Pill>
                  {canManage && <StatusButtons id={r.id} status={r.status} action={setEnquiryStatusAction} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12" aria-labelledby="demand">
        <h2 id="demand" className="font-display text-h2 font-bold">
          Demand by city and service
        </h2>
        {demand.length === 0 ? (
          <p className="mt-2 text-ink-2">No sign-ups yet.</p>
        ) : (
          <table className="mt-4 w-full text-left">
            <thead>
              <tr className="border-b border-ink text-small">
                <th className="py-2">City</th>
                <th className="py-2">Service</th>
                <th className="py-2 text-right">Sign-ups</th>
                <th className="py-2 text-right">Latest</th>
              </tr>
            </thead>
            <tbody>
              {demand.map((d) => (
                <tr key={`${d.city}-${d.service}`} className="border-b border-rule">
                  <td className="py-3">{d.city}</td>
                  <td className="py-3">{d.service}</td>
                  <td className="py-3 text-right tabular">{d.entries}</td>
                  <td className="py-3 text-right">{formatIst(new Date(d.latest))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function StatusButtons({ id, status, action }: { id: string; status: string; action: typeof setWaitlistStatusAction }) {
  const options: [string, string][] =
    status === 'contacted' ? [['closed', 'Close'], ['new', 'Reopen']] : status === 'closed' ? [['new', 'Reopen']] : [['contacted', 'Mark contacted'], ['closed', 'Close']];
  return (
    <>
      {options.map(([next, label]) => (
        <ActionForm key={next} action={action} errorTitle="Could not update" className="gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={next} />
          <SubmitButton variant={next === 'contacted' ? 'primary' : 'secondary'} className="min-h-10 px-3 text-small">
            {label}
          </SubmitButton>
        </ActionForm>
      ))}
    </>
  );
}
