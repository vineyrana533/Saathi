import type { Metadata } from 'next';
import { t } from '@/i18n';
import { ButtonLink, Container, ImagePlaceholder, PageHeading, SectionTitle } from '@/ui/primitives';

export const metadata: Metadata = { title: t('workWithUs.metaTitle'), description: t('workWithUs.lede'), alternates: { canonical: '/work-with-us' } };

export default function WorkWithUsPage() {
  return (
    <Container className="pb-8">
      <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-7">
          <PageHeading title={t('workWithUs.title')} lede={t('workWithUs.lede')} />
          <ButtonLink href="/sign-in?next=/worker/profile">{t('workWithUs.cta')}</ButtonLink>
        </div>
        <div className="lg:col-span-5">
          <ImagePlaceholder description="a driver standing beside a car outside a residential society gate, Noida, morning" ratio="4 / 5" />
        </div>
      </div>
      <section aria-labelledby="need-title" className="mt-section grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <SectionTitle id="need-title">{t('workWithUs.needTitle')}</SectionTitle>
        </div>
        <ul className="lg:col-span-7">
          {(['1', '2', '3', '4'] as const).map((n) => (
            <li key={n} className="border-b border-rule py-4">
              {t(`workWithUs.need${n}`)}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="pay-title" className="mt-section max-w-3xl">
        <SectionTitle id="pay-title">{t('workWithUs.earnTitle')}</SectionTitle>
        <p className="mt-4 text-body-l text-ink-2">{t('workWithUs.earnBody')}</p>
      </section>
    </Container>
  );
}
