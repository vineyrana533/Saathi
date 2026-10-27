import type { Metadata } from 'next';
import Link from 'next/link';
import { t } from '@/i18n';
import { listMyBookings } from '@/modules/bookings/service';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { StatusPill } from '@/ui/booking-parts';
import { ButtonLink, Container, EmptyState, PageHeading } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('booking.listTitle'), robots: { index: false, follow: false } };

export default async function BookingsPage() {
  const { ctx } = await requireSession('/bookings');
  const rows = await listMyBookings(ctx);
  return (
    <Container className="pb-16">
      <PageHeading title={t('booking.listTitle')} />
      {rows.length === 0 ? (
        <EmptyState title={t('booking.listEmpty')} body={t('home.lede')} action={<ButtonLink href="/delhi/personal-driver">{t('booking.listEmptyCta')}</ButtonLink>} />
      ) : (
        <ul className="border-t border-ink">
          {rows.map((b) => (
            <li key={b.id} className="grid gap-2 border-b border-rule py-5 md:grid-cols-12 md:items-center">
              <div className="md:col-span-6">
                <Link href={`/bookings/${b.id}`} className="font-display text-h4 font-semibold hover:underline">
                  {b.serviceName}
                  {b.workerName ? `, ${b.workerName}` : ''}
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
