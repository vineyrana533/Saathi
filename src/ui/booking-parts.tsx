import { t, type MessageKey } from '@/i18n';
import { formatIst } from '@/platform/time';
import { ActionForm, SubmitButton } from './action-form';
import { Field, Pill, Select, STATUS_TONE, Textarea, Timeline } from './primitives';
import type { ActionState } from './action-form';

type Action = (s: ActionState, fd: FormData) => Promise<ActionState>;

export function StatusPill({ status }: { status: string }) {
  return <Pill tone={STATUS_TONE[status] ?? 'neutral'}>{t(`status.${status}` as MessageKey)}</Pill>;
}

/** Large, readable code for the customer to read out (start or end of job). */
export function CodePanel({ title, help, code }: { title: string; help: string; code: string }) {
  return (
    <section aria-labelledby={`code-${title}`} className="border-2 border-trust bg-trust-tint p-6">
      <h2 id={`code-${title}`} className="font-display text-h4 font-semibold text-trust">
        {title}
      </h2>
      <p className="mt-2 font-display text-display-l font-extrabold tracking-[0.3em] text-trust tabular" aria-label={code.split('').join(' ')}>
        {code}
      </p>
      <p className="mt-2 text-small text-ink">{help}</p>
    </section>
  );
}

export function BookingTimeline({ events }: { events: { at: Date; to: string }[] }) {
  return (
    <Timeline
      items={events.map((e, i) => ({
        title: t(`events.${e.to}` as MessageKey) === `events.${e.to}` ? t(`status.${e.to}` as MessageKey) : t(`events.${e.to}` as MessageKey),
        time: formatIst(e.at),
        current: i === events.length - 1,
      }))}
    />
  );
}

export function ChatPanel({
  bookingId,
  messages,
  open,
  action,
}: {
  bookingId: string;
  messages: { id: string; mine: boolean; body: string; status: string; notice: string | null; createdAt: Date }[];
  open: boolean;
  action: Action;
}) {
  return (
    <section aria-labelledby="chat-title" className="border-t border-ink pt-6">
      <h2 id="chat-title" className="font-display text-h3 font-semibold">
        {t('booking.chatTitle')}
      </h2>
      <p className="mt-1 text-small text-ink-2">{t('booking.chatNote')}</p>
      <ol aria-live="polite" className="mt-4 flex flex-col gap-3">
        {messages.length === 0 && <li className="text-ink-3">{t('booking.chatEmpty')}</li>}
        {messages.map((m) => (
          <li key={m.id} className={`max-w-[85%] rounded-xs px-4 py-2 ${m.mine ? 'self-end bg-paper-2' : 'self-start border border-rule bg-surface'} ${m.status !== 'delivered' ? 'border border-danger' : ''}`}>
            <p className={m.status !== 'delivered' ? 'text-ink-3 line-through' : ''}>{m.body}</p>
            {m.notice && <p className="mt-1 text-small text-danger">{m.notice}</p>}
            <p className="mt-1 text-[0.75rem] text-ink-3">{formatIst(m.createdAt, { timeStyle: 'short' })}</p>
          </li>
        ))}
      </ol>
      {open ? (
        <ActionForm action={action} errorTitle={t('common.errorTitle')} className="mt-4" resetOnSuccess>
          <input type="hidden" name="bookingId" value={bookingId} />
          <Field id="f-body" label={t('booking.chatPlaceholder')}>
            <Textarea id="f-body" name="body" required maxLength={1000} className="min-h-20" />
          </Field>
          <div>
            <SubmitButton variant="secondary">{t('booking.chatSend')}</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <p className="mt-4 text-ink-3">{t('booking.chatClosed')}</p>
      )}
    </section>
  );
}

export function RatingForm({ bookingId, workerId, name, action }: { bookingId: string; workerId?: string; name: string; action: Action }) {
  // One form per person on a team booking, so ids must stay unique on the page.
  const key = workerId ? workerId.slice(0, 8) : 'one';
  return (
    <section aria-labelledby={`rate-title-${key}`} className="border-t border-ink pt-6">
      <h2 id={`rate-title-${key}`} className="font-display text-h3 font-semibold">
        {t('booking.rateTitle', { name })}
      </h2>
      <ActionForm action={action} errorTitle={t('common.errorTitle')} className="mt-4">
        <input type="hidden" name="bookingId" value={bookingId} />
        {workerId && <input type="hidden" name="workerId" value={workerId} />}
        <fieldset id={`f-score-${key}`}>
          <legend className="text-small font-semibold">{t('booking.rateScore')}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[5, 4, 3, 2, 1].map((n) => (
              <label key={n} className="flex min-h-11 cursor-pointer items-center gap-2 border border-field-border bg-surface px-3 has-[:checked]:border-ink has-[:checked]:bg-accent-tint">
                <input type="radio" name="score" value={n} required className="size-4 accent-ink" />
                <span aria-hidden="true">{'★'.repeat(n)}</span>
                <span className="sr-only">{t('booking.stars', { n })}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field id={`f-comment-${key}`} label={t('booking.rateComment')}>
          <Textarea id={`f-comment-${key}`} name="comment" maxLength={500} />
        </Field>
        <div>
          <SubmitButton>{t('booking.rateSubmit')}</SubmitButton>
        </div>
      </ActionForm>
    </section>
  );
}

export function ReportForm({ entityType, entityId, action }: { entityType: 'booking' | 'worker_profile'; entityId: string; action: Action }) {
  const reasons = ['safety', 'inappropriate', 'off_platform_payment', 'harassment', 'fake_profile', 'other'] as const;
  return (
    <details className="border-t border-rule pt-4">
      <summary className="cursor-pointer font-semibold text-danger">{t('booking.reportTitle')}</summary>
      <ActionForm action={action} errorTitle={t('common.errorTitle')} className="mt-4">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <Field id="f-reason" label={t('booking.reportReason')}>
          <Select id="f-reason" name="reason">
            {reasons.map((r) => (
              <option key={r} value={r}>
                {t(`reportReasons.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-details" label={t('booking.reportDetails')}>
          <Textarea id="f-details" name="details" maxLength={1000} />
        </Field>
        <div>
          <SubmitButton variant="secondary">{t('booking.reportSubmit')}</SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
