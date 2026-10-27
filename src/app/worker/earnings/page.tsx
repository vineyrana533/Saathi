import { t } from '@/i18n';
import { getMyEarnings } from '@/modules/payments/service';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { Notice, PageHeading } from '@/ui/primitives';
import { requireAnyRole } from '../../_lib/session';

export default async function EarningsPage() {
  const { ctx } = await requireAnyRole(['worker'], '/worker/earnings');
  const e = await getMyEarnings(ctx);
  return (
    <>
      <PageHeading title={t('worker.earnings')} />
      <p className="text-small text-ink-2">{t('worker.earningsTotal')}</p>
      <p className="font-display text-display-l font-bold tabular">{formatInr(e.total)}</p>
      <div className="mt-6">
        <Notice tone="info">{t('worker.earningsNote')}</Notice>
      </div>
      {e.rows.length === 0 ? (
        <p className="mt-8 text-ink-2">{t('worker.earningsEmpty')}</p>
      ) : (
        <table className="mt-8 w-full">
          <caption className="sr-only">{t('worker.earnings')}</caption>
          <thead>
            <tr className="border-b border-ink text-left text-small">
              <th scope="col" className="py-2">
                {t('cityService.date')}
              </th>
              <th scope="col" className="py-2">
                {t('worker.bookingRef')}
              </th>
              <th scope="col" className="py-2 text-right">
                {t('worker.earning')}
              </th>
            </tr>
          </thead>
          <tbody>
            {e.rows.map((r, i) => (
              <tr key={i} className="border-b border-rule">
                <td className="py-3">{formatIst(new Date(r.created_at), { dateStyle: 'medium' })}</td>
                <td className="py-3">{r.ref}</td>
                <td className="py-3 text-right tabular">{formatInr(r.credited)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
