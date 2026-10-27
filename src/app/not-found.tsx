import { t } from '@/i18n';
import { ButtonLink, Container, PageHeading } from '@/ui/primitives';

export default function NotFound() {
  return (
    <main id="main">
      <Container className="pb-16">
        <PageHeading title={t('common.notFoundTitle')} lede={t('common.notFoundBody')} />
        <ButtonLink href="/">{t('common.home')}</ButtonLink>
      </Container>
    </main>
  );
}
