import type { Metadata } from 'next';
import { t } from '@/i18n';
import { listServiceCityPairs } from '@/modules/catalog/service';
import { formatInr } from '@/modules/pricing/engine';
import { ButtonLink, Container, ImagePlaceholder, SectionTitle } from '@/ui/primitives';
import { ServiceGrid } from '@/ui/service-grid';
import { env } from '@/platform/env';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: t('home.metaTitle'),
  description: t('home.metaDescription'),
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const pairs = await listServiceCityPairs();
  // Every active service, Tier C included since T-31. Tier B stays hidden while its status is disabled.
  const services = new Map<string, { slug: string; name: string; summary: string; live: string[]; rate: number | null }>();
  for (const p of pairs) {
    if (p.serviceStatus !== 'active') continue;
    const s = services.get(p.serviceSlug) ?? { slug: p.serviceSlug, name: p.serviceName, summary: p.serviceSummary, live: [], rate: null };
    if (p.status === 'live') s.live.push(p.cityName);
    const rate = (p.pricing as { hourlyRatePaise?: number }).hourlyRatePaise ?? null;
    if (rate != null && (s.rate == null || rate < s.rate)) s.rate = rate;
    services.set(p.serviceSlug, s);
  }
  const driver = services.get('personal-driver');
  const driverRate = driver?.rate != null ? formatInr(driver.rate) : '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: t('brand.name'),
    url: env().SITE_URL,
    areaServed: ['Delhi', 'Noida', 'Gurugram'],
  };
  const faq = [
    { q: t('home.faqPriceQ'), a: t('home.faqPriceA', { price: driverRate }) },
    { q: t('home.faqCancelQ'), a: t('home.faqCancelA') },
    { q: t('home.faqCashQ'), a: t('home.faqCashA') },
    { q: t('home.faqGenderQ'), a: t('home.faqGenderA') },
  ];
  // FAQPage markup only because the same questions are visible on the page (section 13).
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <section className="border-b border-rule">
        <Container className="grid gap-10 pb-16 pt-12 md:pt-20 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <p className="eyebrow mb-5">{t('home.eyebrow')}</p>
            <h1 className="font-display text-display-xl font-extrabold text-balance">
              {t('home.titleBefore')} <span className="accent-word">{t('home.titleAccent')}</span>
            </h1>
            <p className="mt-6 text-body-l text-ink-2 prose-measure">{t('home.lede')}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="#services">{t('home.ctaPrimary')}</ButtonLink>
              <ButtonLink href="/how-it-works" variant="secondary">
                {t('home.ctaSecondary')}
              </ButtonLink>
            </div>
          </div>
          <div className="lg:col-span-4">
            <ImagePlaceholder description="people from Saathi at work: a driver, an event host and someone running an errand, Delhi NCR" ratio="4 / 5" />
          </div>
        </Container>
      </section>

      <section id="services" aria-labelledby="services-title" className="py-section">
        <Container>
          <div className="mb-10 grid gap-4 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <p className="eyebrow mb-3">{t('home.servicesEyebrow')}</p>
              <SectionTitle id="services-title">{t('home.servicesTitle')}</SectionTitle>
            </div>
            <p className="text-ink-2 prose-measure lg:col-span-5">{t('home.servicesLede')}</p>
          </div>
          <ServiceGrid
            services={[...services.values()].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({
              slug: s.slug,
              name: s.name,
              summary: s.summary,
              href: `/delhi/${s.slug}`,
              statusTone: s.live.length ? 'success' : 'warning',
              statusLabel: s.live.length ? t('home.bookableIn', { cities: s.live.join(', ') }) : t('home.comingSoon'),
              priceLabel: s.rate ? t('home.fromPrice', { price: formatInr(s.rate) }) : null,
            }))}
            other={{ title: t('home.otherTitle'), body: t('home.otherBody'), cta: t('home.otherCta'), href: '/request' }}
          />
        </Container>
      </section>

      <section aria-labelledby="how-title" className="bg-paper-2 py-section">
        <Container>
          <SectionTitle id="how-title">{t('home.howTitle')}</SectionTitle>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {(['1', '2', '3'] as const).map((n) => (
              <li key={n} className="border-t border-ink pt-5">
                <p className="font-display text-h1 font-bold text-accent tabular" aria-hidden="true">
                  0{n}
                </p>
                <h3 className="mt-3 font-display text-h3 font-semibold">{t(`home.step${n}Title`)}</h3>
                <p className="mt-2 text-ink-2">{t(`home.step${n}Body`)}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="safety" aria-labelledby="safety-title" className="py-section">
        <Container className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <SectionTitle id="safety-title">{t('home.safetyTitle')}</SectionTitle>
          </div>
          <ul className="space-y-0 lg:col-span-7">
            {(['1', '2', '3', '4', '5'] as const).map((n) => (
              <li key={n} className="flex gap-4 border-b border-rule py-4">
                <span aria-hidden="true" className="mt-1 text-trust">
                  ✓
                </span>
                <span>{t(`home.safety${n}`)}</span>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section aria-labelledby="work-title" className="border-y border-rule py-section">
        <Container className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <SectionTitle id="work-title">{t('home.workTitle')}</SectionTitle>
            <p className="mt-4 text-body-l text-ink-2 prose-measure">{t('home.workBody')}</p>
            <ButtonLink href="/work-with-us" variant="secondary" className="mt-6">
              {t('home.workCta')}
            </ButtonLink>
          </div>
          <div className="lg:col-span-5">
            <ImagePlaceholder description="a driver checking the route on a phone before a job in Noida" />
          </div>
        </Container>
      </section>

      <section aria-labelledby="faq-title" className="py-section">
        <Container className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <SectionTitle id="faq-title">{t('home.faqTitle')}</SectionTitle>
          </div>
          <dl className="lg:col-span-8">
            {faq.map((f) => (
              <div key={f.q} className="border-b border-rule py-5">
                <dt className="font-display text-h4 font-semibold">{f.q}</dt>
                <dd className="mt-2 text-ink-2 prose-measure">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>
    </>
  );
}
