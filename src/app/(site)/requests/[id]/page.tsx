import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t, type MessageKey } from '@/i18n';
import { getMyRequest } from '@/modules/requests/assisted';
import { getServiceInCity } from '@/modules/catalog/service';
import { hasCurrentConsent } from '@/modules/identity/service';
import { myIdCheck } from '@/modules/identity/id-check';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { isAppError } from '@/platform/errors';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { ButtonLink, Checkbox, Container, Field, Notice, Pill, PriceTable, STATUS_TONE, Textarea } from '@/ui/primitives';
import { requireSession } from '../../../_lib/session';
import { acceptQuoteAction, cancelRequestAction, respondQuoteAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Request', robots: { index: false, follow: false } };

const OPEN = ['submitted', 'in_review', 'sourcing', 'quoted'];

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, session } = await requireSession(`/requests/${id}`);
  let r;
  try {
    r = await getMyRequest(ctx, id);
  } catch (e) {
    if (isAppError(e) && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const current = r.quotes.find((q) => q.status === 'sent') ?? null;
  const earlier = r.quotes.filter((q) => q !== current);
  const s = current ? await getServiceInCity(r.serviceSlug, r.citySlug) : null;
  const [consented, idCheck] = await Promise.all([
    hasCurrentConsent(ctx, 'code_of_conduct'),
    s?.service.config.customerVerification === 'id' && session.roles.includes('customer') ? myIdCheck(ctx) : Promise.resolve(null),
  ]);
  const needsId = s?.service.config.customerVerification === 'id' && idCheck?.status !== 'approved';
  const paying = !!r.booking?.paymentOpen;

  return (
    <Container className="pb-16">
      <div className="flex flex-wrap items-center gap-4 pt-10">
        <p className="eyebrow">{t('requests.ref', { ref: r.ref })}</p>
        <Pill tone={STATUS_TONE[r.status] ?? 'neutral'}>{t(`requestStatus.${r.status}` as MessageKey)}</Pill>
      </div>
      <h1 className="mt-3 font-display text-h1 font-bold">
        {r.serviceName}, {formatIst(r.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })}
      </h1>
      <p className="mt-2 text-body-l text-ink-2">
        {formatIst(r.startsAt, { timeStyle: 'short' })} to {formatIst(r.endsAt, { timeStyle: 'short' })}, {r.zoneName}, {r.cityName} ·{' '}
        {r.workersNeeded === 1 ? t('requests.personCount') : t('requests.peopleCount', { n: r.workersNeeded })}
      </p>

      <div className="mt-10 grid gap-12 lg:grid-cols-12">
        <div className="flex flex-col gap-10 lg:col-span-7">
          {r.booking && r.status === 'accepted' && (
            <Notice tone="success">
              <ButtonLink href={`/bookings/${r.booking.id}`}>{t('requests.goToBooking')}</ButtonLink>
            </Notice>
          )}
          {OPEN.includes(r.status) && !current && (
            <Notice tone="info">
              {t('requests.waiting')} {r.status === 'submitted' ? t('requests.replyBy', { due: formatIst(r.firstResponseDueAt) }) : ''}
            </Notice>
          )}
          {r.status === 'expired' && <Notice tone="warning">{t('requests.closedExpired')}</Notice>}
          {r.status === 'declined' && <Notice tone="neutral">{t('requests.closedDeclined')}</Notice>}
          {r.status === 'cancelled' && <Notice tone="neutral">{t('requests.closedCancelled')}</Notice>}

          {current && (
            <section aria-labelledby="quote-title" className="border border-rule-strong bg-surface p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="quote-title" className="font-display text-h3 font-semibold">
                  {t('requests.quoteTitle')}
                </h2>
                <p className="text-small text-ink-2">
                  {t('requests.quoteVersion', { version: current.version })} · {current.expiresAt ? t('requests.validUntil', { time: formatIst(current.expiresAt) }) : ''}
                </p>
              </div>
              <p className="mt-2 text-ink-2">
                {formatIst(current.startsAt, { weekday: 'short', day: 'numeric', month: 'short' })}, {formatIst(current.startsAt, { timeStyle: 'short' })} to{' '}
                {formatIst(current.endsAt, { timeStyle: 'short' })} · {t('requests.perPerson', { rate: formatInr(current.hourlyRatePaise) })}
              </p>
              <div className="mt-4">
                <PriceTable
                  caption={t('confirm.priceCaption')}
                  lines={current.lines.map((l) => ({ label: l.label, amount: formatInr(l.amountPaise) }))}
                  totalLabel={t('confirm.total')}
                  total={formatInr(current.totalPaise)}
                />
              </div>
              {current.messageToCustomer && (
                <div className="mt-4">
                  <p className="text-small font-semibold">{t('requests.message')}</p>
                  <p className="mt-1 whitespace-pre-line">{current.messageToCustomer}</p>
                </div>
              )}
              {current.workersCount > 1 || current.proposed.length > 0 ? (
                <div className="mt-4">
                  <p className="text-small font-semibold">{t('requests.proposedTitle')}</p>
                  <ul className="mt-1">
                    {current.proposed.map((p) => (
                      <li key={p.id}>
                        <Link className="link" href={`/workers/${p.id}`}>
                          {p.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {current.workersCount > current.proposed.length && (
                    <p className="mt-1 text-small text-ink-2">{t('requests.proposedMore', { n: current.workersCount - current.proposed.length })}</p>
                  )}
                </div>
              ) : null}

              {paying ? (
                <ButtonLink href={`/checkout/${r.booking!.id}`} className="mt-6">
                  {t('requests.continuePayment')}
                </ButtonLink>
              ) : needsId ? (
                <div className="mt-6">
                  <Notice tone="warning" title={t('search.idNeededTitle')}>
                    <Link className="link font-semibold" href="/account#id-check">
                      {t('search.idCta')}
                    </Link>
                  </Notice>
                </div>
              ) : (
                <ActionForm action={acceptQuoteAction} errorTitle={t('common.errorTitle')} className="mt-6">
                  <input type="hidden" name="quoteId" value={current.id} />
                  {!consented && (
                    <div>
                      <Checkbox id="f-conduct" name="conduct" required label={t('confirm.conduct')} />
                      <Link href="/code-of-conduct" className="link text-small" target="_blank">
                        {t('confirm.conductLink')}
                      </Link>
                    </div>
                  )}
                  <p className="text-small text-ink-2">{t('requests.acceptHelp')}</p>
                  <div>
                    <SubmitButton>{t('requests.accept', { total: formatInr(current.totalPaise) })}</SubmitButton>
                  </div>
                </ActionForm>
              )}

              <details className="mt-6 border-t border-rule pt-4">
                <summary className="cursor-pointer font-semibold">{t('requests.changeTitle')}</summary>
                <ActionForm action={respondQuoteAction} errorTitle={t('common.errorTitle')} className="mt-4">
                  <input type="hidden" name="quoteId" value={current.id} />
                  <input type="hidden" name="requestId" value={r.id} />
                  <input type="hidden" name="action" value="change" />
                  <Field id="f-note" label={t('requests.changeNote')}>
                    <Textarea id="f-note" name="note" required maxLength={500} className="min-h-20" />
                  </Field>
                  <div>
                    <SubmitButton variant="secondary">{t('requests.changeSubmit')}</SubmitButton>
                  </div>
                </ActionForm>
              </details>
              <details className="mt-4 border-t border-rule pt-4">
                <summary className="cursor-pointer font-semibold">{t('requests.declineTitle')}</summary>
                <ActionForm action={respondQuoteAction} errorTitle={t('common.errorTitle')} className="mt-4">
                  <input type="hidden" name="quoteId" value={current.id} />
                  <input type="hidden" name="requestId" value={r.id} />
                  <input type="hidden" name="action" value="decline" />
                  <Field id="f-decline-note" label={t('requests.declineNote')}>
                    <Textarea id="f-decline-note" name="note" maxLength={500} className="min-h-20" />
                  </Field>
                  <div>
                    <SubmitButton variant="danger">{t('requests.declineSubmit')}</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </section>
          )}

          {OPEN.includes(r.status) && (
            <section aria-labelledby="cancel-title" className="border-t border-ink pt-6">
              <h2 id="cancel-title" className="font-display text-h3 font-semibold">
                {t('requests.cancelTitle')}
              </h2>
              <ActionForm action={cancelRequestAction} errorTitle={t('common.errorTitle')} className="mt-4">
                <input type="hidden" name="requestId" value={r.id} />
                <Field id="f-reason" label={t('requests.cancelReason')}>
                  <Textarea id="f-reason" name="reason" required maxLength={300} className="min-h-20" />
                </Field>
                <div>
                  <SubmitButton variant="danger">{t('requests.cancelSubmit')}</SubmitButton>
                </div>
              </ActionForm>
            </section>
          )}
        </div>

        <aside className="flex flex-col gap-10 lg:col-span-5">
          <dl className="border-t border-ink">
            {r.answersDisplay.map((a) => (
              <div key={a.label} className="grid grid-cols-3 gap-4 border-b border-rule py-3">
                <dt className="text-ink-2">{a.label}</dt>
                <dd className="col-span-2">{a.value}</dd>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-4 border-b border-rule py-3">
              <dt className="text-ink-2">{t('confirm.address')}</dt>
              <dd className="col-span-2">
                {r.addressLine}
                {r.landmark ? `, ${r.landmark}` : ''}
              </dd>
            </div>
            {r.details && (
              <div className="grid grid-cols-3 gap-4 border-b border-rule py-3">
                <dt className="text-ink-2">{t('requests.detailsLabel')}</dt>
                <dd className="col-span-2 whitespace-pre-line">{r.details}</dd>
              </div>
            )}
            {r.budgetPaise != null && (
              <div className="border-b border-rule py-3 text-ink-2">{t('requests.budgetLine', { amount: formatInr(r.budgetPaise) })}</div>
            )}
          </dl>
          {earlier.length > 0 && (
            <div>
              <h2 className="mb-3 font-display text-h4 font-semibold">{t('requests.earlierQuotes')}</h2>
              <ul className="border-t border-rule">
                {earlier.map((q) => (
                  <li key={q.id} className="border-b border-rule py-3">
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        {t('requests.quoteVersion', { version: q.version })}, {formatInr(q.totalPaise)}
                      </span>
                      <Pill tone={STATUS_TONE[q.status] ?? 'neutral'}>{t(`quoteStatus.${q.status}` as MessageKey)}</Pill>
                    </p>
                    {q.customerNote && <p className="mt-1 text-small text-ink-2">{t('requests.yourNote', { note: q.customerNote })}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h2 className="mb-4 font-display text-h4 font-semibold">{t('requests.history')}</h2>
            <ol className="border-l border-rule-strong pl-5">
              {r.events.map((e, i) => (
                <li key={i} className="pb-4">
                  <p className="font-semibold">{t(`requestEvents.${e.to}` as MessageKey)}</p>
                  <p className="text-small text-ink-2">{formatIst(e.at)}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Container>
  );
}
