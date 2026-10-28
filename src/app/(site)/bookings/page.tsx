import type { Metadata } from 'next';
import Link from 'next/link';
import { t, type MessageKey } from '@/i18n';
import { listMyBookings } from '@/modules/bookings/service';
import { listMyRequests } from '@/modules/requests/assisted';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { StatusPill } from '@/ui/booking-parts';
import { ButtonLink, Container, EmptyState, PageHeading, Pill, STATUS_TONE } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('booking.listTitle'), robots: { index: false, follow: false } };

export default async function BookingsPage() {
  const { ctx, session } = await requireSession('/bookings');
  const [rows, requests] = await Promise.all([listMyBookings(ctx), session.roles.includes('customer') ? listMyRequests(ctx) : Promise.resolve([])]);
  // Accepted requests already appear as bookings; the rest still need an answer or are closed.
  const openRequests = requests.filter((r) => r.status !== 'accepted');
  return (
    <Container className="pb-16">
      {openRequests.length > 0 && (
        <section aria-labelledby="requests-title" className="mb-12">
          <h2 id="requests-title" className="pt-10 font-display text-h2 font-bold">
            {t('requests.listTitle')}
          </h2>
          <ul className="mt-4 border-t border-ink">
            {openRequests.map((r) => (
              <li key={r.id} className="grid gap-2 border-b border-rule py-5 md:grid-cols-12 md:items-center">
                <div className="md:col-span-8">
                  <Link href={`/requests/${r.id}`} className="font-display text-h4 font-semibold hover:underline">
                    {r.serviceName}, {r.workersNeeded === 1 ? t('requests.personCount') : t('requests.peopleCount', { n: r.workersNeeded })}
                  </Link>
                  <p className="text-small text-ink-2">
                    {formatIst(r.startsAt)} · {r.zoneName}, {r.cityName} · {t('requests.ref', { ref: r.ref })}
                  </p>
                </div>
                <div className="md:col-span-4 md:text-right">
                  <Pill tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`requestStatus.${r.status}` as MessageKey)}</Pill>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PageHeading title={t('booking.listTitle')} />
      {rows.length === 0 ? (
        <EmptyState title={t('booking.listEmpty')} body={t('home.lede')} action={<ButtonLink href="/#services">{t('booking.listEmptyCta')}</ButtonLink>} />
      ) : (
        <ul className="border-t border-ink">
          {rows.map((b) => (
            <li key={b.id} className="grid gap-2 border-b border-rule py-5 md:grid-cols-12 md:items-center">
              <div className="md:col-span-6">
                <Link href={`/bookings/${b.id}`} className="font-display text-h4 font-semibold hover:underline">
                  {b.serviceName}
                  {b.workersNeeded > 1 ? `, ${t('booking.teamSize', { n: b.workersNeeded })}` : b.workerName ? `, ${b.workerName}` : ''}
                </Link>
                <p className="text-small text-ink-2">
                  {formatIst(b.startsAt)} · {b.zoneName}, {b.cityName} · {t('booking.ref', { ref: b.ref })}
                </p>
              </div>
              <div className="md:col-span-3">
                <StatusPill status={b.status} />
              </div>
              <p className="font-display font-bold tabular md:col-span-3 md:text-right">{formatInr(b.totalPaise)}</p>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
