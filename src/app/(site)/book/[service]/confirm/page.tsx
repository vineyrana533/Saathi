import type { Metadata } from 'next';
import Link from 'next/link';
import { t, errorText } from '@/i18n';
import { searchAvailableWorkers, getPublicWorkerProfile } from '@/modules/bookings/service';
import { hasCurrentConsent } from '@/modules/identity/service';
import { listZonesByCitySlug } from '@/modules/geo/service';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { isAppError } from '@/platform/errors';
import { getConfig } from '@/platform/config';
import { anonymousCtx, withDb } from '@/platform/db/client';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { ButtonLink, Checkbox, Container, Field, Input, Notice, PageHeading, PriceTable } from '@/ui/primitives';
import { requireSession } from '../../../../_lib/session';
import { slotFromParams, toQuery, type SearchParams } from '../params';
import { confirmBookingAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('confirm.title'), robots: { index: false, follow: false } };

export default async function ConfirmPage({ params, searchParams }: { params: Promise<{ service: string }>; searchParams: Promise<SearchParams> }) {
  const { service } = await params;
  const sp = await searchParams;
  const workerId = typeof sp.worker === 'string' ? sp.worker : '';
  const { ctx } = await requireSession(`/book/${service}/confirm?${toQuery(sp, { worker: workerId })}`);
  const input = slotFromParams(service, sp);
  const back = `/book/${service}?${toQuery(sp)}`;

  let result;
  try {
    result = await searchAvailableWorkers(ctx, input);
  } catch (e) {
    return (
      <Container className="pb-16">
        <PageHeading title={t('confirm.title')} />
        <Notice tone="danger">{isAppError(e) ? errorText(e.code, e.message) : t('common.genericError')}</Notice>
      </Container>
    );
  }
  const [worker, consented, zones, holdMinutes] = await Promise.all([
    getPublicWorkerProfile(workerId),
    hasCurrentConsent(ctx, 'code_of_conduct'),
    listZonesByCitySlug(input.citySlug),
    withDb(anonymousCtx(), (tx) => getConfig(tx, 'booking.payment_hold_minutes')),
  ]);
  const stillFree = result.workers.some((w) => w.id === workerId);
  if (!worker || !result.slot || !result.quote || !stillFree) {
    return (
      <Container className="pb-16">
        <PageHeading title={t('confirm.title')} />
        <Notice tone="warning">{t('errors.worker_unavailable')}</Notice>
        <ButtonLink href={back} className="mt-6">
          {t('common.back')}
        </ButtonLink>
      </Container>
    );
  }
  const q = result.quote;
  const s = result.serviceInCity;
  const freeUntil = new Date(result.slot.startsAt.getTime() - s.service.config.cancellationPolicy.freeBeforeHours * 3600_000);
  const zoneName = result.location?.localityName ?? result.location?.zoneName ?? zones.find((z) => z.id === input.zoneId)?.name ?? '';

  return (
    <Container className="pb-16">
      <PageHeading eyebrow={`${s.service.name}, ${s.city.name}`} title={t('confirm.title')} />
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <dl className="border-t border-ink">
            {[
              [t('booking.driver'), worker.displayName],
              [
                t('cityService.date'),
                t('confirm.when', {
                  date: formatIst(result.slot.startsAt, { weekday: 'short', day: 'numeric', month: 'short' }),
                  start: formatIst(result.slot.startsAt, { timeStyle: 'short' }),
                  end: formatIst(result.slot.endsAt, { timeStyle: 'short' }),
                }),
              ],
              [t('cityService.zone'), t('confirm.where', { area: zoneName, city: s.city.name })],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-4 border-b border-rule py-3">
                <dt className="text-ink-2">{k}</dt>
                <dd className="col-span-2 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-10 font-display text-h3 font-semibold">{t('confirm.addressTitle')}</h2>
          <ActionForm action={confirmBookingAction} errorTitle={t('common.errorTitle')} className="mt-6">
            {Object.entries({
              service, city: input.citySlug, zone: input.zoneId ?? '', loc: input.localityId ?? '', lat: input.lat != null ? String(input.lat) : '', lng: input.lng != null ? String(input.lng) : '',
              date: input.date, time: input.time, duration: String(input.durationMinutes), worker: workerId, expectedTotalPaise: String(q.customer.totalPaise),
            }).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {Object.entries(input.answers).map(([k, v]) => (
              <input key={k} type="hidden" name={`a.${k}`} value={v} />
            ))}
            <Field id="f-addressLine" label={t('confirm.address')} help={t('confirm.addressHelp')}>
              <Input id="f-addressLine" name="addressLine" autoComplete="street-address" required minLength={5} maxLength={200} />
            </Field>
            <Field id="f-landmark" label={t('confirm.landmark')}>
              <Input id="f-landmark" name="landmark" maxLength={100} />
            </Field>
            {s.service.config.questions
              .filter((qq) => qq.type === 'text')
              .map((qq) => (
                <Field key={qq.id} id={`f-answers-${qq.id}`} label={qq.label} help={qq.help} optional={qq.required ? undefined : t('common.optional')}>
                  <Input id={`f-answers-${qq.id}`} name={`a.${qq.id}`} maxLength={qq.maxLength} />
                </Field>
              ))}
            {!consented && (
              <div>
                <Checkbox id="f-conduct" name="conduct" required label={t('confirm.conduct')} />
                <Link href="/code-of-conduct" className="link text-small" target="_blank">
                  {t('confirm.conductLink')}
                </Link>
              </div>
            )}
            <p className="text-small text-ink-2">{t('confirm.hold', { minutes: holdMinutes })}</p>
            <SubmitButton>{t('confirm.submit', { total: formatInr(q.customer.totalPaise) })}</SubmitButton>
          </ActionForm>
        </div>
        <div className="lg:col-span-5">
          <PriceTable
            caption={t('confirm.priceCaption')}
            lines={q.customer.lines.map((l) => ({ label: l.label, amount: formatInr(l.amountPaise) }))}
            totalLabel={t('confirm.total')}
            total={formatInr(q.customer.totalPaise)}
            footnote={t('confirm.cancelSummary', { time: formatIst(freeUntil, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}
          />
        </div>
      </div>
    </Container>
  );
}
