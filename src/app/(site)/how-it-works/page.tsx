import type { Metadata } from 'next';
import { t } from '@/i18n';
import { ButtonLink, Container, PageHeading, SectionTitle } from '@/ui/primitives';

export const metadata: Metadata = { title: t('how.metaTitle'), description: t('how.lede'), alternates: { canonical: '/how-it-works' } };

export default function HowItWorksPage() {
  return (
    <Container className="pb-8">
      <PageHeading title={t('how.title')} lede={t('how.lede')} />
      <ol className="grid gap-10 border-t border-ink pt-8 md:grid-cols-3">
        {(['1', '2', '3'] as const).map((n) => (
          <li key={n}>
            <p className="font-display text-h1 font-bold text-accent tabular" aria-hidden="true">
              0{n}
            </p>
            <h2 className="mt-3 font-display text-h3 font-semibold">{t(`home.step${n}Title`)}</h2>
            <p className="mt-2 text-ink-2">{t(`home.step${n}Body`)}</p>
          </li>
        ))}
      </ol>
      <section id="safety" aria-labelledby="safety-title" className="mt-section grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionTitle id="safety-title">{t('home.safetyTitle')}</SectionTitle>
        </div>
        <ul className="lg:col-span-7">
          {(['1', '2', '3', '4', '5'] as const).map((n) => (
            <li key={n} className="flex gap-4 border-b border-rule py-4">
              <span aria-hidden="true" className="text-trust">
                ✓
              </span>
              {t(`home.safety${n}`)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="cancel-title" className="mt-section max-w-3xl">
        <SectionTitle id="cancel-title">{t('home.faqCancelQ')}</SectionTitle>
        <p className="mt-4 text-body-l text-ink-2">{t('home.faqCancelA')}</p>
        <ButtonLink href="/#services" className="mt-8">
          {t('home.ctaPrimary')}
        </ButtonLink>
      </section>
    </Container>
  );
}
