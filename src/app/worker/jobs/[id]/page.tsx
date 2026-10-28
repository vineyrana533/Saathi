import { notFound } from 'next/navigation';
import { t } from '@/i18n';
import { getBookingForViewer } from '@/modules/bookings/service';
import { listChatMessages } from '@/modules/chat/service';
import { myRatingFor } from '@/modules/reviews/service';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { isAppError } from '@/platform/errors';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { BookingTimeline, ChatPanel, RatingForm, ReportForm, StatusPill } from '@/ui/booking-parts';
import { Checkbox, Field, Input, Notice, Textarea } from '@/ui/primitives';
import { requireSession } from '../../../_lib/session';
import { cancelAction, jobCodeAction, rateAction, reportAction, sendChatAction } from '../../../_lib/booking-actions';

export default async function WorkerJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession(`/worker/jobs/${id}`);
  let b;
  try {
    b = await getBookingForViewer(ctx, id);
  } catch (e) {
    if (isAppError(e) && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  if (b.viewer !== 'worker') notFound();
  const [messages, myRating] = await Promise.all([listChatMessages(ctx, id), myRatingFor(ctx, id)]);
  const phase = b.status === 'confirmed' ? 'start' : b.status === 'in_progress' ? 'end' : null;

  return (
    <div className="flex flex-col gap-10 pt-8">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">{t('worker.jobTitle', { ref: b.ref })}</p>
          <StatusPill status={b.status} />
        </div>
        <h1 className="mt-3 font-display text-h1 font-bold">{formatIst(b.startsAt, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</h1>
        <p className="mt-2 text-ink-2">
          {formatIst(b.startsAt, { timeStyle: 'short' })} to {formatIst(b.endsAt, { timeStyle: 'short' })}, {b.zoneName}, {b.cityName}. {t('booking.customer')}: {b.customerName}
          {b.workersNeeded > 1 ? `. ${t('booking.teamSize', { n: b.workersNeeded })}: ${b.workers.map((w) => w.name).join(', ')}` : ''}
        </p>
      </div>

      {b.otpLocked && <Notice tone="danger">{t('errors.otp_locked')}</Notice>}
      {phase && (
        <section aria-labelledby="code-title" className="border-2 border-trust bg-trust-tint p-6">
          <h2 id="code-title" className="font-display text-h3 font-semibold text-trust">
            {phase === 'start' ? t('worker.startTitle') : t('worker.endTitle')}
          </h2>
          <ActionForm key={phase} action={jobCodeAction} errorTitle={t('common.errorTitle')} className="mt-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="phase" value={phase} />
            <Field id="f-code" label={phase === 'start' ? t('worker.startHelp') : t('worker.endHelp')}>
              <Input id="f-code" name="code" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" required className="max-w-40 font-display text-h3 font-bold tracking-[0.4em]" />
            </Field>
            <div>
              <SubmitButton>{phase === 'start' ? t('worker.start') : t('worker.finish')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      )}

      <dl className="border-t border-ink">
        <div className="grid grid-cols-3 gap-4 border-b border-rule py-3">
          <dt className="text-ink-2">{t('worker.address')}</dt>
          <dd className="col-span-2">{b.addressLine ? `${b.addressLine}${b.landmark ? `, ${b.landmark}` : ''}` : t('worker.addressHidden')}</dd>
        </div>
        {b.answersDisplay.map((a) => (
          <div key={a.label} className="grid grid-cols-3 gap-4 border-b border-rule py-3">
            <dt className="text-ink-2">{a.label}</dt>
            <dd className="col-span-2">{a.value}</dd>
          </div>
        ))}
        {b.workerEarning && (
          <div className="grid grid-cols-3 gap-4 border-b border-rule py-3">
            <dt className="text-ink-2">{t('worker.earning')}</dt>
            <dd className="col-span-2 font-display font-bold tabular">{formatInr(b.workerEarning.netPaise)}</dd>
          </div>
        )}
      </dl>

      <ChatPanel bookingId={b.id} messages={messages} open={['confirmed', 'in_progress', 'completed'].includes(b.status)} action={sendChatAction} />

      {b.status === 'completed' && !myRating && <RatingForm bookingId={b.id} name={b.customerName ?? t('booking.customer')} action={rateAction} />}

      {b.status === 'confirmed' && (
        <section aria-labelledby="unsafe-title" className="border-t border-ink pt-6">
          <h2 id="unsafe-title" className="font-display text-h4 font-semibold">
            {t('worker.unsafeCancel')}
          </h2>
          <p className="mt-1 text-small text-ink-2">{t('worker.unsafeHelp')}</p>
          <ActionForm action={cancelAction} errorTitle={t('common.errorTitle')} className="mt-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <Field id="f-reason" label={t('booking.cancelReason')}>
              <Textarea id="f-reason" name="reason" required maxLength={300} className="min-h-20" />
            </Field>
            <Checkbox id="f-unsafe" name="unsafe" defaultChecked label={t('booking.cancelUnsafe')} />
            <div>
              <SubmitButton variant="danger">{t('booking.cancelSubmit')}</SubmitButton>
            </div>
          </ActionForm>
        </section>
      )}

      <div>
        <h2 className="mb-4 font-display text-h4 font-semibold">{t('booking.timeline')}</h2>
        <BookingTimeline events={b.events} />
      </div>
      <ReportForm entityType="booking" entityId={b.id} action={reportAction} />
    </div>
  );
}
