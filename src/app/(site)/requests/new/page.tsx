import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t } from '@/i18n';
import { getServiceInCity } from '@/modules/catalog/service';
import { listLocalityOptions } from '@/modules/geo/location';
import { LocationPicker } from '@/ui/location-picker';
import { hasCurrentConsent } from '@/modules/identity/service';
import { myIdCheck } from '@/modules/identity/id-check';
import { formatInr } from '@/modules/pricing/engine';
import { firstBookableDateIst, minutesToHhmm, todayIst } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { BookingQuestions } from '@/ui/booking-questions';
import { Checkbox, Container, Field, Input, Notice, PageHeading, Select, Textarea } from '@/ui/primitives';
import { requireSession } from '../../../_lib/session';
import { createRequestAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('requests.newTitle'), robots: { index: false, follow: false } };

/** Assisted request form (Milestone 2): people, time, place and details; our team replies with a quote. */
export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ service?: string; city?: string }> }) {
  const sp = await searchParams;
  const service = sp.service ?? '';
  const city = sp.city ?? 'delhi';
  const { ctx, session } = await requireSession(`/requests/new?service=${encodeURIComponent(service)}&city=${encodeURIComponent(city)}`);
  const s = await getServiceInCity(service, city);
  if (!s) notFound();
  const cfg = s.service.config;
  const [localityOptions, consented, idCheck] = await Promise.all([
    listLocalityOptions(city),
    hasCurrentConsent(ctx, 'code_of_conduct'),
    cfg.customerVerification === 'id' && session.roles.includes('customer') ? myIdCheck(ctx) : Promise.resolve(null),
  ]);
  const needsId = cfg.customerVerification === 'id' && idCheck?.status !== 'approved';
  // Requests give our team at least a day to find people (business default B-03).
  const firstDate = firstBookableDateIst(Math.max(cfg.leadTimeMinutes, 24 * 60), '10:00');
  const durations: number[] = [];
  for (let m = cfg.durationMinutes.min; m <= cfg.durationMinutes.max; m += cfg.durationMinutes.step) durations.push(m);
  const times: string[] = [];
  for (let m = cfg.allowedHours.startMinute; m + cfg.durationMinutes.min <= cfg.allowedHours.endMinute; m += 30) times.push(minutesToHhmm(m));
  const rate = s.serviceCity.pricing.hourlyRatePaise ?? 0;

  return (
    <Container className="max-w-2xl pb-16">
      <PageHeading eyebrow={`${s.service.name}, ${s.city.name}`} title={t('requests.newTitle')} lede={t('requests.newLede')} />
      {needsId && (
        <div className="mb-6">
          <Notice tone="warning" title={t('search.idNeededTitle')}>
            <p>{t('requests.idNeeded')}</p>
            <p className="mt-2">
              <Link className="link font-semibold" href="/account#id-check">
                {t('search.idCta')}
              </Link>
            </p>
          </Notice>
        </div>
      )}
      <ActionForm action={createRequestAction} errorTitle={t('common.errorTitle')}>
        <input type="hidden" name="service" value={service} />
        <input type="hidden" name="city" value={city} />
        <Field id="f-workersNeeded" label={t('requests.people')} help={t('requests.peopleHelp', { max: cfg.workersRequired.max })}>
          <Input id="f-workersNeeded" name="workersNeeded" type="number" inputMode="numeric" min={1} max={cfg.workersRequired.max} defaultValue={1} required className="max-w-32" />
        </Field>
        <LocationPicker id="f-loc" name="loc" latName="lat" lngName="lng" label={t('cityService.zone')} help={t('location.areaHelp')} options={localityOptions} labels={{ useMine: t('location.useMine'), locating: t('location.locating'), using: t('location.using'), denied: t('location.denied'), outside: t('location.outside') }} />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="f-date" label={t('cityService.date')}>
            <Input id="f-date" name="date" type="date" required defaultValue={firstDate} min={todayIst()} />
          </Field>
          <Field id="f-time" label={t('cityService.time')}>
            <Select id="f-time" name="time" defaultValue="10:00">
              {times.map((tm) => (
                <option key={tm} value={tm}>
                  {tm}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field id="f-durationMinutes" label={t('cityService.duration')}>
          <Select id="f-durationMinutes" name="durationMinutes" defaultValue={String(cfg.durationMinutes.min)}>
            {durations.map((d) => (
              <option key={d} value={d}>
                {rate
                  ? t('requests.durationOption', { hours: t('cityService.hours', { n: d / 60 }), price: formatInr(Math.round((rate * d) / 60)) })
                  : t('cityService.hours', { n: d / 60 })}
              </option>
            ))}
          </Select>
        </Field>
        <BookingQuestions questions={cfg.questions} optionalLabel={t('common.optional')} />
        <Field id="f-addressLine" label={t('confirm.address')} help={t('confirm.addressHelp')}>
          <Input id="f-addressLine" name="addressLine" autoComplete="street-address" required minLength={5} maxLength={200} />
        </Field>
        <Field id="f-landmark" label={t('confirm.landmark')}>
          <Input id="f-landmark" name="landmark" maxLength={100} />
        </Field>
        <Field id="f-details" label={t('requests.details')} help={t('requests.detailsHelp')}>
          <Textarea id="f-details" name="details" maxLength={1000} />
        </Field>
        <Field id="f-budgetRupees" label={t('requests.budget')}>
          <Input id="f-budgetRupees" name="budgetRupees" type="number" inputMode="numeric" min={0} className="max-w-48" />
        </Field>
        {!consented && (
          <div>
            <Checkbox id="f-conduct" name="conduct" required label={t('confirm.conduct')} />
            <Link href="/code-of-conduct" className="link text-small" target="_blank">
              {t('confirm.conductLink')}
            </Link>
          </div>
        )}
        <div>
          <SubmitButton>{t('requests.submit')}</SubmitButton>
        </div>
      </ActionForm>
    </Container>
  );
}
