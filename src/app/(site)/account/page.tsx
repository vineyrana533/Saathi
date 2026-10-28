import type { Metadata } from 'next';
import { t } from '@/i18n';
import { getMyAccount } from '@/modules/identity/service';
import { myIdCheck, type IdType } from '@/modules/identity/id-check';
import { maskPhone } from '@/platform/auth/phone';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { ButtonLink, Checkbox, Container, Field, Input, Notice, PageHeading, Pill, Select } from '@/ui/primitives';
import { requireSession } from '../../_lib/session';
import { logoutAction, saveAccountAction, submitIdCheckAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('account.title'), robots: { index: false, follow: false } };

const ID_TYPE_LABELS: [IdType, string][] = [
  ['aadhaar', 'Aadhaar'],
  ['pan', 'PAN'],
  ['voter_id', 'Voter ID'],
  ['passport', 'Passport'],
  ['driving_licence', 'Driving licence'],
];

export default async function AccountPage() {
  const { ctx, session } = await requireSession('/account');
  const me = await getMyAccount(ctx);
  // undefined: this account cannot book (no customer role), so the ID section is not shown.
  const idCheck = session.roles.includes('customer') ? await myIdCheck(ctx) : undefined;
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
      {idCheck !== undefined && (
        <section id="id-check" aria-labelledby="id-title" className="mt-12 border-t border-rule pt-8">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="id-title" className="font-display text-h3 font-semibold">
              {t('account.idTitle')}
            </h2>
            {idCheck && (
              <Pill tone={idCheck.status === 'approved' ? 'success' : idCheck.status === 'pending' ? 'warning' : 'danger'}>
                {t(idCheck.status === 'approved' ? 'account.idApproved' : idCheck.status === 'pending' ? 'account.idPending' : 'account.idRejected')}
              </Pill>
            )}
          </div>
          {idCheck?.status === 'approved' ? (
            <p className="mt-3 text-ink-2">
              {t('account.idApprovedBody')} {idCheck.numberMasked}
            </p>
          ) : idCheck?.status === 'pending' ? (
            <p className="mt-3 text-ink-2">{t('account.idPendingBody')}</p>
          ) : (
            <>
              <p className="mt-3 text-ink-2 prose-measure">{t('account.idLede')}</p>
              {idCheck?.reviewNote && (
                <div className="mt-4">
                  <Notice tone="danger">{idCheck.reviewNote}</Notice>
                </div>
              )}
              <ActionForm action={submitIdCheckAction} errorTitle={t('common.errorTitle')} className="mt-6" encType="multipart/form-data">
                <Field id="f-idType" label={t('account.idType')}>
                  <Select id="f-idType" name="idType" required>
                    {ID_TYPE_LABELS.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="f-numberLast4" label={t('account.idLast4')}>
                  <Input id="f-numberLast4" name="numberLast4" maxLength={4} minLength={4} autoComplete="off" required className="max-w-32" />
                </Field>
                <Field id="f-file" label={t('account.idFile')}>
                  <input id="f-file" name="file" type="file" accept="image/jpeg,image/png,application/pdf" required className="min-h-12 text-small" />
                </Field>
                <Checkbox id="f-idConsent" name="consent" required label={t('account.idConsent')} />
                <div>
                  <SubmitButton variant="secondary">{t('account.idSubmit')}</SubmitButton>
                </div>
              </ActionForm>
            </>
          )}
        </section>
      )}
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
