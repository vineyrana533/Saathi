import type { Metadata } from 'next';
import { t } from '@/i18n';
import { listCities } from '@/modules/geo/service';
import { todayIst } from '@/platform/time';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { Checkbox, Container, Field, Input, Notice, PageHeading, Select, Textarea } from '@/ui/primitives';
import { createEnquiryAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('request.metaTitle'), description: t('request.lede'), alternates: { canonical: '/request' } };

export default async function RequestPage() {
  const cities = await listCities();
  return (
    <Container className="max-w-2xl pb-16">
      <PageHeading title={t('request.title')} lede={t('request.lede')} />
      <div className="mb-8">
        <Notice tone="info">{t('request.rules')}</Notice>
      </div>
      <ActionForm action={createEnquiryAction} errorTitle={t('common.errorTitle')} resetOnSuccess>
        <Field id="f-need" label={t('request.need')} help={t('request.needHelp')}>
          <Textarea id="f-need" name="need" required minLength={5} maxLength={1000} />
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="f-citySlug" label={t('request.city')}>
            <Select id="f-citySlug" name="citySlug" defaultValue="delhi">
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="f-wantedOn" label={t('request.wantedOn')}>
            <Input id="f-wantedOn" name="wantedOn" type="date" min={todayIst()} />
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="f-name" label={t('request.name')}>
            <Input id="f-name" name="name" autoComplete="name" required />
          </Field>
          <Field id="f-phone" label={t('request.phone')}>
            <Input id="f-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required />
          </Field>
        </div>
        <Checkbox id="f-consent" name="consent" required label={t('request.consent')} />
        <div>
          <SubmitButton>{t('request.submit')}</SubmitButton>
        </div>
      </ActionForm>
    </Container>
  );
}
