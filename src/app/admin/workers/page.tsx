import { listWorkersForAdmin } from '@/modules/workers/service';
import { can } from '@/platform/auth/permissions';
import { maskPhone } from '@/platform/auth/phone';
import { formatIst } from '@/platform/time';
import { Input, Notice, Pagination, Pill, Select, STATUS_TONE } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';

export default async function AdminWorkers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireAnyRole(STAFF, '/admin/workers');
  if (!can(ctx, 'worker.verify')) return <Notice tone="warning">Your role cannot view worker records.</Notice>;
  const sp = await searchParams;
  const res = await listWorkersForAdmin(ctx, { status: sp.status || undefined, q: sp.q || undefined, page: Number(sp.page) || 1 });
  const qs = (p: number) => `/admin/workers?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Workers</h1>
      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-small font-semibold">
          Name
          <Input name="q" defaultValue={sp.q ?? ''} className="w-64" />
        </label>
        <label className="flex flex-col gap-1 text-small font-semibold">
          Status
          <Select name="status" defaultValue={sp.status ?? ''} className="w-48">
            <option value="">Any</option>
            <option value="applicant">Applicant</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </Select>
        </label>
        <button className="min-h-12 rounded-xs border border-ink px-5 font-semibold hover:bg-paper-2">Filter</button>
      </form>
      {res.rows.length === 0 ? (
        <p className="mt-8 text-ink-2">No workers match.</p>
      ) : (
        <div className="mt-6 overflow-x-auto" role="region" aria-label="Workers table" tabIndex={0}>
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-ink text-small">
                <th className="py-2">Name</th>
                <th className="py-2">Phone</th>
                <th className="py-2">Status</th>
                <th className="py-2">ID</th>
                <th className="py-2">Model</th>
                <th className="py-2">Rating</th>
                <th className="py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((w) => (
                <tr key={w.id} className="border-b border-rule">
                  <td className="py-3 font-semibold">{w.displayName}</td>
                  <td className="py-3 tabular">{maskPhone(w.phone)}</td>
                  <td className="py-3">
                    <Pill tone={STATUS_TONE[w.status] ?? 'neutral'}>{w.status}</Pill>
                  </td>
                  <td className="py-3">{w.kycStatus}</td>
                  <td className="py-3">{w.workforceModel}</td>
                  <td className="py-3 tabular">{w.ratingCount ? `${(w.ratingAvgX100 / 100).toFixed(1)} (${w.ratingCount})` : 'None'}</td>
                  <td className="py-3">{formatIst(w.createdAt, { dateStyle: 'medium' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={res.page} hasNext={res.hasNext} hrefFor={qs} />
    </>
  );
}
