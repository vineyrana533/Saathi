import type { Metadata } from 'next';
import { t } from '@/i18n';
import { CONSENT_VERSIONS, hasCurrentConsent } from '@/modules/identity/service';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Container, Notice, PageHeading } from '@/ui/primitives';
import { pageSession } from '../../_lib/session';
import { acceptConductAction } from '../account/actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('conduct.title'), alternates: { canonical: '/code-of-conduct' } };

export default async function CodeOfConductPage() {
  const { ctx, session } = await pageSession();
  const accepted = session ? await hasCurrentConsent(ctx, 'code_of_conduct') : false;
  return (
    <Container className="max-w-3xl pb-8">
      <PageHeading title={t('conduct.title')} lede={t('conduct.p1')} />
      <Notice tone="warning">{t('conduct.draft', { version: CONSENT_VERSIONS.code_of_conduct })}</Notice>
      <ol className="mt-8 list-decimal pl-6">
        {(['1', '2', '3', '4', '5', '6', '7'] as const).map((n) => (
          <li key={n} className="border-b border-rule py-3 pl-2">
            {t(`conduct.r${n}`)}
          </li>
        ))}
      </ol>
      {session &&
        (accepted ? (
          <p className="mt-8 text-success">{t('conduct.accepted')}</p>
        ) : (
          <ActionForm action={acceptConductAction} errorTitle={t('common.errorTitle')} className="mt-8">
            <div>
              <SubmitButton>{t('conduct.accept')}</SubmitButton>
            </div>
          </ActionForm>
        ))}
    </Container>
  );
}
