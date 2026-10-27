import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { t } from '@/i18n';
import { getBookingForViewer } from '@/modules/bookings/service';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { isAppError } from '@/platform/errors';
import { ActionForm, SubmitButton } from '@/ui/action-form';
import { ButtonLink, Container, Notice, PageHeading, PriceTable } from '@/ui/primitives';
import { requireSession } from '../../../_lib/session';
import { sandboxPayAction } from './actions';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment', robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireSession(`/checkout/${id}`);
  let b;
  try {
    b = await getBookingForViewer(ctx, id);
  } catch (e) {
    if (isAppError(e) && e.status === 404) notFound();
    throw e;
  }
  if (b.viewer !== 'customer') notFound();
  if (b.status !== 'pending_payment') redirect(`/bookings/${id}`);
  const expired = b.holdExpired;

  return (
    <Container className="max-w-3xl pb-16">
      <PageHeading title={t('checkout.title', { ref: b.ref })} lede={b.holdExpiresAt ? t('checkout.holdUntil', { time: formatIst(b.holdExpiresAt, { timeStyle: 'short' }) }) : undefined} />
      {b.payment?.mode === 'sandbox' && (
        <div className="mb-8">
          <Notice tone="warning" title={t('checkout.sandboxTitle')}>
            {t('checkout.sandboxBody')}
          </Notice>
        </div>
      )}
      {b.price && (
        <PriceTable
          caption={t('confirm.priceCaption')}
          lines={b.price.lines.map((l) => ({ label: l.label, amount: formatInr(l.amountPaise) }))}
          totalLabel={t('confirm.total')}
          total={formatInr(b.price.totalPaise)}
        />
      )}
      {expired ? (
        <div className="mt-8">
          <Notice tone="danger">{t('checkout.expired')}</Notice>
          <ButtonLink href={`/${b.citySlug}/${b.serviceSlug}`} className="mt-6">
            {t('common.back')}
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-8 flex flex-wrap gap-4">
          <ActionForm action={sandboxPayAction} errorTitle={t('common.errorTitle')}>
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="outcome" value="captured" />
            <SubmitButton>{t('checkout.pay', { total: formatInr(b.totalPaise ?? 0) })}</SubmitButton>
          </ActionForm>
          <ActionForm action={sandboxPayAction} errorTitle={t('common.errorTitle')}>
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="outcome" value="failed" />
            <SubmitButton variant="secondary">{t('checkout.fail')}</SubmitButton>
          </ActionForm>
        </div>
      )}
    </Container>
  );
}
