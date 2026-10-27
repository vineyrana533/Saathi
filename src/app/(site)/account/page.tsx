import type { Metadata } from 'next';
import { t } from '@/i18n';
import { getMyAccount } from '@/modules/identity/service';
import { maskPhone } from '@/platform/auth/phone';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { ButtonLink, Container, Field, Input, PageHeading, Select } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';
import { logoutAction, saveAccountAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('account.title'), robots: { index: false, follow: false } };

export default async function AccountPage() {
  const { ctx, session } = await requireSession('/account');
  const me = await getMyAccount(ctx);
  return (
    <Container className="max-w-2xl pb-16">
      <PageHeading title={t('account.title')} lede={`${t('account.phone')}: ${maskPhone(session.phoneE164)}`} />
      <ActionForm action={saveAccountAction} errorTitle={t('common.errorTitle')}>
        <Field id="f-displayName" label={t('account.name')}>
          <Input id="f-displayName" name="displayName" autoComplete="name" required defaultValue={me?.displayName ?? ''} />
        </Field>
        <Field id="f-email" label={t('account.email')}>
          <Input id="f-email" name="email" type="email" autoComplete="email" defaultValue={me?.email ?? ''} />
        </Field>
        <Field id="f-gender" label={t('account.gender')} help={t('account.genderHelp')}>
          <Select id="f-gender" name="gender" defaultValue={me?.gender ?? ''}>
            <option value="">{t('account.genderNone')}</option>
            <option value="female">{t('account.genderFemale')}</option>
            <option value="male">{t('account.genderMale')}</option>
            <option value="non_binary">{t('account.genderNonBinary')}</option>
          </Select>
        </Field>
        <div>
          <SubmitButton>{t('account.save')}</SubmitButton>
        </div>
      </ActionForm>
      <div className="mt-12 border-t border-rule pt-8">
        <p className="font-display text-h4 font-semibold">{t('account.work')}</p>
        <ButtonLink href={session.roles.includes('worker') ? '/worker' : '/work-with-us'} variant="secondary" className="mt-3">
          {session.roles.includes('worker') ? t('nav.workerPortal') : t('account.workCta')}
        </ButtonLink>
      </div>
      <form action={logoutAction} className="mt-12 border-t border-rule pt-8">
        <button type="submit" className="link font-semibold">
          {t('account.logout')}
        </button>
      </form>
    </Container>
  );
}
