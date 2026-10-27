import Link from 'next/link';
import { listBookingsForAdmin } from '@/modules/bookings/service';
import { BOOKING_STATUSES } from '@/modules/bookings/schema';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { StatusPill } from '@/ui/booking-parts';
import { Input, Pagination, Select } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';

export default async function AdminBookings({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { ctx } = await requireAnyRole(STAFF, '/admin/bookings');
  const sp = await searchParams;
  const res = await listBookingsForAdmin(ctx, { status: sp.status || undefined, q: sp.q || undefined, page: Number(sp.page) || 1 });
  const qs = (p: number) => `/admin/bookings?${new URLSearchParams({ ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(p) })}`;
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Bookings</h1>
      <form className="mt-6 flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-small font-semibold">
          Booking ref
          <Input name="q" defaultValue={sp.q ?? ''} placeholder="SA-" className="w-48" />
        </label>
        <label className="flex flex-col gap-1 text-small font-semibold">
          Status
          <Select name="status" defaultValue={sp.status ?? ''} className="w-56">
            <option value="">Any</option>
            {BOOKING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </label>
        <button className="min-h-12 rounded-xs border border-ink px-5 font-semibold hover:bg-paper-2">Filter</button>
      </form>
      {res.rows.length === 0 ? (
        <p className="mt-8 text-ink-2">No bookings match.</p>
      ) : (
        <div className="mt-6 overflow-x-auto" role="region" aria-label="Bookings table" tabIndex={0}>
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-ink text-small">
                <th className="py-2">Ref</th>
                <th className="py-2">When</th>
                <th className="py-2">Service and area</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Worker</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((b) => (
                <tr key={b.id} className="border-b border-rule">
                  <td className="py-3">
                    <Link className="link font-semibold" href={`/admin/bookings/${b.id}`}>
                      {b.ref}
                    </Link>
                  </td>
                  <td className="py-3">{formatIst(b.startsAt)}</td>
                  <td className="py-3">
                    {b.serviceName}, {b.zoneName}, {b.cityName}
                  </td>
                  <td className="py-3">{b.customerName ?? 'Unnamed'}</td>
                  <td className="py-3">{b.workerName ?? 'None'}</td>
                  <td className="py-3">
                    <StatusPill status={b.status} />
                  </td>
                  <td className="py-3 text-right tabular">{formatInr(b.totalPaise)}</td>
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
