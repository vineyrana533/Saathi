import { notFound } from 'next/navigation';
import { getBookingForViewer } from '@/modules/bookings/service';
import { listChatMessages } from '@/modules/chat/service';
import { bookingLedgerForStaff } from '@/modules/ops/queries';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { isAppError } from '@/platform/errors';
import { BookingTimeline, StatusPill } from '@/ui/booking-parts';
import { Notice, PriceTable } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../../_lib/session';

export default async function AdminBookingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireAnyRole(STAFF, `/admin/bookings/${id}`);
  let b;
  try {
    b = await getBookingForViewer(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    if (isAppError(e) && e.status === 403) return <Notice tone="warning">Your role cannot view bookings. Ask an admin for the ops or support role.</Notice>;
    throw e;
  }
  const [ledger, messages] = await Promise.all([bookingLedgerForStaff(ctx, id), listChatMessages(ctx, id).catch(() => [])]);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-h1 font-bold">{b.ref}</h1>
        <StatusPill status={b.status} />
      </div>
      <p className="mt-2 text-ink-2">
        {b.serviceName}, {formatIst(b.startsAt)} to {formatIst(b.endsAt, { timeStyle: 'short' })}, {b.zoneName}, {b.cityName}
      </p>
      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-7">
          <dl className="border-t border-ink">
            {[
              ['Customer', b.customerName ?? 'Unnamed'],
              ['Worker', b.worker?.name ?? 'None'],
              ['Address', b.addressLine ?? ''],
              ['Payment', b.payment ? `${b.payment.status} (${b.payment.mode}, ${b.payment.provider}, ${b.payment.orderId})` : 'None'],
              ['Cancelled by', b.cancelledBy ? `${b.cancelledBy}: ${b.cancelReason}` : 'Not cancelled'],
              ['OTP lock', b.otpLocked ? 'Locked after too many wrong codes' : 'No'],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-4 border-b border-rule py-3">
                <dt className="text-ink-2">{k}</dt>
                <dd className="col-span-2 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <section>
            <h2 className="font-display text-h3 font-semibold">Ledger</h2>
            {ledger === null ? (
              <Notice tone="info">Only finance and admin roles can see ledger lines.</Notice>
            ) : ledger.length === 0 ? (
              <p className="mt-2 text-ink-2">No journal entries yet.</p>
            ) : (
              <table className="mt-3 w-full text-left">
                <thead>
                  <tr className="border-b border-ink text-small">
                    <th className="py-2">Journal</th>
                    <th className="py-2">Account</th>
                    <th className="py-2 text-right">Debit</th>
                    <th className="py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((l, i) => (
                    <tr key={i} className="border-b border-rule">
                      <td className="py-2">{l.kind}</td>
                      <td className="py-2">{l.code}</td>
                      <td className="py-2 text-right tabular">{Number(l.debit) ? formatInr(Number(l.debit)) : ''}</td>
                      <td className="py-2 text-right tabular">{Number(l.credit) ? formatInr(Number(l.credit)) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section>
            <h2 className="font-display text-h3 font-semibold">Chat ({messages.length})</h2>
            <ul className="mt-3 border-t border-ink">
              {messages.map((m) => (
                <li key={m.id} className="border-b border-rule py-2 text-small">
                  <span className="text-ink-3">{formatIst(m.createdAt, { timeStyle: 'short' })}</span> {m.status !== 'delivered' && <strong className="text-danger">[{m.status}] </strong>}
                  {m.body}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <aside className="flex flex-col gap-8 lg:col-span-5">
          {b.price && (
            <PriceTable caption="Price snapshot" lines={b.price.lines.map((l) => ({ label: l.label, amount: formatInr(l.amountPaise) }))} totalLabel="Customer total" total={formatInr(b.price.totalPaise)} />
          )}
          {b.workerEarning && (
            <PriceTable
              caption="Worker earning"
              lines={[{ label: 'Service amount', amount: formatInr(b.workerEarning.grossPaise) }, ...b.workerEarning.deductions.map((d) => ({ label: d.label, amount: `-${formatInr(d.amountPaise)}` }))]}
              totalLabel="Worker net"
              total={formatInr(b.workerEarning.netPaise)}
            />
          )}
          <BookingTimeline events={b.events} />
        </aside>
      </div>
    </>
  );
}
