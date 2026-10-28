import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { t } from '@/i18n';
import { getCityServicePage } from '@/modules/seo/service';
import { listZonesByCitySlug } from '@/modules/geo/service';
import { formatInr } from '@/modules/pricing/engine';
import { minutesToHhmm, todayIst, tomorrowIst } from '@/platform/time';
import { env } from '@/platform/env';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { BookingQuestions } from '@/ui/booking-questions';
import { Container, Field, Input, Select, Textarea, Notice } from '@/ui/primitives';
import { joinWaitlistAction } from './actions';

export const dynamic = 'force-dynamic';

type Params = { city: string; service: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { city, service } = await params;
  const page = await getCityServicePage(city, service);
  if (!page) return { robots: { index: false } };
  const cfg = page.service.config;
  const vars = {
    service: page.service.name,
    serviceLower: page.service.name.toLowerCase(),
    city: page.city.name,
    minHours: cfg.durationMinutes.min / 60,
    lead: cfg.leadTimeMinutes / 60,
    price: formatInr(page.serviceCity.pricing.hourlyRatePaise ?? 0),
  };
  return {
    title: t('cityService.metaTitle', vars),
    // Prices and booking rules are only promised where the service is live.
    description: page.supply.live
      ? t('cityService.metaDescription', vars)
      : `${page.service.summary} ${t('cityService.metaNotLive', { city: page.city.name })}`,
    alternates: { canonical: `/${city}/${service}` },
    // Section 13 and 17: indexable only with live, bookable supply.
    // Staging and local are never indexable, whatever the supply.
    robots: page.indexable && env().APP_ENV === 'production' ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function CityServicePage({ params }: { params: Promise<Params> }) {
  const { city, service } = await params;
  const page = await getCityServicePage(city, service);
  if (!page) notFound();
  const zones = await listZonesByCitySlug(city);
  const cfg = page.service.config;
  const rate = page.serviceCity.pricing.hourlyRatePaise ?? 0;
  const vars = { minHours: cfg.durationMinutes.min / 60, lead: cfg.leadTimeMinutes / 60, price: formatInr(rate) };
  const tomorrow = tomorrowIst();
  const today = todayIst();
  const durations: number[] = [];
  for (let m = cfg.durationMinutes.min; m <= cfg.durationMinutes.max; m += cfg.durationMinutes.step) durations.push(m);
  const times: string[] = [];
  for (let m = cfg.allowedHours.startMinute; m + cfg.durationMinutes.min <= cfg.allowedHours.endMinute; m += 30) times.push(minutesToHhmm(m));
  const direct = page.service.bookingMode !== 'assisted';
  const base = env().SITE_URL.replace(/\/$/, '');

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('cityService.breadcrumbHome'), item: `${base}/` },
        { '@type': 'ListItem', position: 2, name: `${page.service.name}, ${page.city.name}`, item: `${base}/${city}/${service}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: page.service.name,
      serviceType: page.service.name,
      description: page.service.summary,
      areaServed: { '@type': 'City', name: page.city.name },
      provider: { '@type': 'Organization', name: t('brand.name'), url: base },
      ...(page.supply.live && rate ? { offers: { '@type': 'Offer', priceCurrency: 'INR', price: (rate / 100).toFixed(2), unitText: 'HOUR' } } : {}),
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Container>
        <nav aria-label="Breadcrumb" className="pt-6 text-small text-ink-2">
          <ol className="flex gap-2">
            <li>
              <Link className="link" href="/">
                {t('cityService.breadcrumbHome')}
              </Link>
              <span aria-hidden="true"> / </span>
            </li>
            <li aria-current="page">
              {page.service.name}, {page.city.name}
            </li>
          </ol>
        </nav>
        <div className="grid gap-12 pb-8 pt-8 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <h1 className="font-display text-display-l font-bold text-balance">
              {t('cityService.titleBefore', { service: page.service.slug === 'personal-driver' ? t('cityService.pluralDriver') : page.service.name })} <span className="accent-word">{page.city.name}</span>
            </h1>
            <p className="mt-5 text-body-l text-ink-2 prose-measure">
              {page.service.slug === 'personal-driver' ? t('cityService.lede', vars) : page.service.summary}
            </p>
            {cfg.highlights.length > 0 && (
              <>
                <h2 className="mt-10 font-display text-h3 font-semibold">
                  {page.supply.live ? t('cityService.includedTitle') : t('cityService.plannedTitle')}
                </h2>
                <ul className="mt-3">
                  {cfg.highlights.map((h) => (
                    <li key={h} className="border-b border-rule py-3">
                      {h}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {/* Booking rules only make sense where the service can actually be booked. */}
            {page.supply.live && (
              <>
                <h2 className="mt-10 font-display text-h3 font-semibold">{t('cityService.rulesTitle')}</h2>
                <ul className="mt-3 text-ink-2">
                  <li className="border-b border-rule py-3">
                    {t('cityService.rules1', { start: minutesToHhmm(cfg.allowedHours.startMinute), end: minutesToHhmm(cfg.allowedHours.endMinute) })}
                  </li>
                  <li className="border-b border-rule py-3">{t('cityService.rules2', { days: cfg.maxAdvanceDays })}</li>
                  <li className="border-b border-rule py-3">{t('cityService.rules3')}</li>
                </ul>
              </>
            )}
          </div>

          <div className="lg:col-span-6">
            {page.supply.live && direct ? (
              <section aria-labelledby="book-title" className="border border-rule-strong bg-surface p-6">
                <h2 id="book-title" className="font-display text-h3 font-semibold">
                  {t('cityService.formTitle')}
                </h2>
                <form action={`/book/${service}`} method="get" className="mt-6 flex flex-col gap-5">
                  <input type="hidden" name="city" value={city} />
                  <Field id="f-zoneId" label={t('cityService.zone')}>
                    <Select id="f-zoneId" name="zone" required>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="f-date" label={t('cityService.date')}>
                      <Input id="f-date" name="date" type="date" required defaultValue={tomorrow} min={today} />
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
                    <Select id="f-durationMinutes" name="duration" defaultValue={String(cfg.durationMinutes.min)}>
                      {durations.map((d) => (
                        <option key={d} value={d}>
                          {t('cityService.hours', { n: d / 60 })}, {formatInr(Math.round((rate * d) / 60))}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <BookingQuestions questions={cfg.questions.filter((q) => q.type === 'select')} optionalLabel={t('common.optional')} />
                  <fieldset>
                    <legend className="text-small font-semibold">{t('cityService.gender')}</legend>
                    <div className="mt-2 flex flex-wrap gap-x-6">
                      {(
                        [
                          ['', t('cityService.genderAny')],
                          ['female', t('cityService.genderFemale')],
                          ['male', t('cityService.genderMale')],
                        ] as const
                      ).map(([v, label]) => (
                        <label key={v} className="flex min-h-11 items-center gap-2">
                          <input type="radio" name="gender" value={v} defaultChecked={v === ''} className="size-5 accent-ink" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit" className="min-h-12 rounded-xs bg-accent px-5 font-semibold text-white hover:bg-accent-strong">
                    {t('cityService.submit')}
                  </button>
                </form>
              </section>
            ) : (
              <section aria-labelledby="soon-title" className="border border-rule-strong bg-surface p-6">
                <h2 id="soon-title" className="font-display text-h3 font-semibold">
                  {page.service.riskTier === 'C' ? t('cityService.laterTitle', { city: page.city.name }) : t('cityService.comingSoonTitle', { city: page.city.name })}
                </h2>
                <p className="mt-3 text-ink-2">
                  {page.service.riskTier === 'C'
                    ? t('cityService.laterBody')
                    : t('cityService.comingSoonBody', { serviceLower: page.service.name.toLowerCase(), city: page.city.name })}
                </p>
                <ActionForm action={joinWaitlistAction} errorTitle={t('common.errorTitle')} className="mt-6">
                  <input type="hidden" name="citySlug" value={city} />
                  <input type="hidden" name="serviceSlug" value={service} />
                  <input type="hidden" name="cityName" value={page.city.name} />
                  <Field id="f-name" label={t('cityService.name')}>
                    <Input id="f-name" name="name" autoComplete="name" required />
                  </Field>
                  <Field id="f-phone" label={t('cityService.phone')}>
                    <Input id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required />
                  </Field>
                  <Field id="f-need" label={t('cityService.need')} help={t('cityService.needHelp')}>
                    <Textarea id="f-need" name="need" required maxLength={500} />
                  </Field>
                  <Field id="f-wantedOn" label={t('cityService.wantedOn')}>
                    <Input id="f-wantedOn" name="wantedOn" type="date" />
                  </Field>
                  <SubmitButton>{t('cityService.waitlistSubmit')}</SubmitButton>
                </ActionForm>
              </section>
            )}
            {page.supply.live && !direct && (
              <div className="mt-4">
                <Notice tone="info">{page.service.summary}</Notice>
              </div>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}
