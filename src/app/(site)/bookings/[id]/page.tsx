import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t } from '@/i18n';
import { getBookingForViewer } from '@/modules/bookings/service';
import { listChatMessages } from '@/modules/chat/service';
import { myRatingFor } from '@/modules/reviews/service';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { isAppError } from '@/platform/errors';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { BookingTimeline, ChatPanel, CodePanel, RatingForm, ReportForm, StatusPill } from '@/ui/booking-parts';
import { ButtonLink, Checkbox, Container, Field, Notice, PriceTable, Textarea } from '@/ui/primitives';
import { requireSession } from '../../../_lib/session';
import { cancelAction, rateAction, reportAction, sendChatAction } from '../../../_lib/booking-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Booking', robots: { index: false, follow: false } };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession(`/bookings/${id}`);
  let b;
  try {
    b = await getBookingForViewer(ctx, id);
  } catch (e) {
    if (isAppError(e) && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const [messages, myRating] = await Promise.all([listChatMessages(ctx, id), myRatingFor(ctx, id)]);
  const chatOpen = ['pending_payment', 'confirmed', 'in_progress', 'completed'].includes(b.status);
  const canCancel = b.viewer === 'customer' && (b.status === 'pending_payment' || b.status === 'confirmed');
  const fee = b.cancelFeeNowPaise;

  return (
    <Container className="pb-16">
      <div className="flex flex-wrap items-center gap-4 pt-10">
        <p className="eyebrow">{t('booking.ref', { ref: b.ref })}</p>
        <StatusPill status={b.status} />
      </div>
      <h1 className="mt-3 font-display text-h1 font-bold">
        {b.serviceName}, {formatIst(b.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })}
      </h1>
      <p className="mt-2 text-body-l text-ink-2">
        {formatIst(b.startsAt, { timeStyle: 'short' })} to {formatIst(b.endsAt, { timeStyle: 'short' })}, {b.zoneName}, {b.cityName}
      </p>

      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-10 lg:col-span-7">
          {b.status === 'pending_payment' && b.viewer === 'customer' && (
            <Notice tone="warning">
              <ButtonLink href={`/checkout/${b.id}`} className="mt-2">
                {t('booking.payNow')}
              </ButtonLink>
            </Notice>
          )}
          {b.codes.start && <CodePanel title={t('booking.startCodeTitle')} help={t('booking.startCodeHelp')} code={b.codes.start} />}
          {b.codes.end && <CodePanel title={t('booking.endCodeTitle')} help={t('booking.endCodeHelp')} code={b.codes.end} />}

          <dl className="border-t border-ink">
            {b.worker && (
              <div className="grid grid-cols-3 gap-4 border-b border-rule py-3">
                <dt className="text-ink-2">{t('booking.driver')}</dt>
                <dd className="col-span-2 font-semibold">
                  <Link className="link" href={`/workers/${b.worker.id}`}>
                    {b.worker.name}
                  </Link>
                </dd>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 border-b border-rule py-3">
              <dt className="text-ink-2">{t('confirm.address')}</dt>
              <dd className="col-span-2">
                {b.addressLine}
                {b.landmark ? `, ${b.landmark}` : ''}
              </dd>
            </div>
          </dl>

          <ChatPanel bookingId={b.id} messages={messages} open={chatOpen} action={sendChatAction} />

          {b.status === 'completed' && b.worker && !myRating && <RatingForm bookingId={b.id} name={b.worker.name} action={rateAction} />}
          {myRating && <Notice tone="success">{t('booking.rated')}</Notice>}

          {canCancel && (
            <section aria-labelledby="cancel-title" className="border-t border-ink pt-6">
              <h2 id="cancel-title" className="font-display text-h3 font-semibold">
                {t('booking.cancelTitle')}
              </h2>
              <p className="mt-2 text-ink-2">{fee > 0 ? t('booking.cancelFeeLate', { fee: formatInr(fee) }) : t('booking.cancelFeeFree')}</p>
              <ActionForm action={cancelAction} errorTitle={t('common.errorTitle')} className="mt-4">
                <input type="hidden" name="bookingId" value={b.id} />
                <Field id="f-reason" label={t('booking.cancelReason')}>
                  <Textarea id="f-reason" name="reason" required maxLength={300} className="min-h-20" />
                </Field>
                <Checkbox id="f-unsafe" name="unsafe" label={t('booking.cancelUnsafe')} />
                <div>
                  <SubmitButton variant="danger">{t('booking.cancelSubmit')}</SubmitButton>
                </div>
              </ActionForm>
            </section>
          )}
          <ReportForm entityType="booking" entityId={b.id} action={reportAction} />
        </div>

        <aside className="flex flex-col gap-10 lg:col-span-5">
          {b.price && (
            <div>
              <h2 className="mb-3 font-display text-h4 font-semibold">{t('booking.price')}</h2>
              <PriceTable
                caption={t('confirm.priceCaption')}
                lines={b.price.lines.map((l) => ({ label: l.label, amount: formatInr(l.amountPaise) }))}
                totalLabel={t('confirm.total')}
                total={formatInr(b.price.totalPaise)}
              />
            </div>
          )}
          <div>
            <h2 className="mb-4 font-display text-h4 font-semibold">{t('booking.timeline')}</h2>
            <BookingTimeline events={b.events} />
          </div>
        </aside>
      </div>
    </Container>
  );
}
