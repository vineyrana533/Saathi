import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { t } from '@/i18n';
import { env } from '@/platform/env';
import { Container, Notice, PageHeading } from '@/ui/primitives';
import { pageSession } from '../../_lib/session';
import { SignInForm } from './sign-in-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('signIn.title'), robots: { index: false, follow: false } };

/** Only same-site relative paths are allowed as a post-login destination. */
function safeNext(v: string | string[] | undefined) {
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.startsWith('/') && !s.startsWith('//') ? s : '/bookings';
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);
  const { session } = await pageSession();
  if (session) redirect(next);
  return (
    <Container className="max-w-xl pb-16">
      <PageHeading title={t('signIn.title')} lede={t('signIn.lede')} />
      {env().SMS_PROVIDER === 'dev-log' && (
        <div className="mb-6">
          <Notice tone="warning">{t('signIn.sandbox')}</Notice>
        </div>
      )}
      <SignInForm
        next={next}
        labels={{
          phone: t('signIn.phone'),
          send: t('signIn.send'),
          codeTitle: t('signIn.codeTitle'),
          code: t('signIn.code'),
          verify: t('signIn.verify'),
          change: t('signIn.change'),
          resend: t('signIn.resend'),
          errorTitle: t('common.errorTitle'),
          generic: t('common.genericError'),
        }}
      />
    </Container>
  );
}
