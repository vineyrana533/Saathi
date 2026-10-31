import type { Metadata } from 'next';
import Link from 'next/link';
import { t, errorText } from '@/i18n';
import { searchAvailableWorkers } from '@/modules/bookings/service';
import { myIdCheck } from '@/modules/identity/id-check';
import { formatInr } from '@/modules/pricing/engine';
import { formatIst } from '@/platform/time';
import { isAppError } from '@/platform/errors';
import { Avatar, ButtonLink, Container, EmptyState, Notice, PageHeading, VerifiedBadge } from '@/ui/primitives';
import { pageSession } from '../../../_lib/session';
import { slotFromParams, toQuery, type SearchParams } from './params';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('search.title'), robots: { index: false, follow: false } };

export default async function SearchPage({ params, searchParams }: { params: Promise<{ service: string }>; searchParams: Promise<SearchParams> }) {
  const { service } = await params;
  const sp = await searchParams;
  const input = slotFromParams(service, sp);
  const { ctx, session } = await pageSession();
  const back = `/${input.citySlug || 'delhi'}/${service}`;

  let result;
  try {
    result = await searchAvailableWorkers(ctx, input);
  } catch (e) {
    return (
      <Container className="pb-16">
        <PageHeading title={t('search.title')} />
        <Notice tone="danger" title={t('common.errorTitle')}>
          {isAppError(e) ? errorText(e.code, e.message) : t('common.genericError')}
        </Notice>
        <ButtonLink href={back} variant="secondary" className="mt-6">
          {t('search.change')}
        </ButtonLink>
      </Container>
    );
  }

  const s = result.serviceInCity;
  if (!result.live || !result.slot || !result.quote) {
    return (
      <Container className="pb-16">
        <PageHeading title={t('search.notLiveTitle')} lede={t('search.notLiveBody', { service: s.service.name, city: s.city.name })} />
        <ButtonLink href={back}>{t('common.back')}</ButtonLink>
      </Container>
    );
  }

  const workers = result.workers.slice(0, 20);
  const hasMore = result.workers.length > 20;
  const area = result.location?.localityName ?? result.location?.zoneName ?? '';
  const docs = s.service.config.workerRequirements;
  const hours = input.durationMinutes / 60;
  // In-home services need a verified customer ID; say so before people pick someone, not after.
  const idStatus =
    s.service.config.customerVerification !== 'id' ? 'approved' : session?.roles.includes('customer') ? (await myIdCheck(ctx))?.status ?? 'none' : 'none';

  return (
    <Container className="pb-16">
      <PageHeading
        eyebrow={`${s.service.name}, ${s.city.name}`}
        title={t('search.title')}
        lede={t('search.summary', {
          date: formatIst(result.slot.startsAt, { weekday: 'short', day: 'numeric', month: 'short' }),
          start: formatIst(result.slot.startsAt, { timeStyle: 'short' }),
          end: formatIst(result.slot.endsAt, { timeStyle: 'short' }),
          area,
        })}
      />
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink pb-4">
        <p className="font-semibold" role="status">
          {workers.length === 1 ? t('search.countOne') : t('search.count', { n: workers.length + (hasMore ? '+' : '') })}
        </p>
        <Link className="link" href={`${back}`}>
          {t('search.change')}
        </Link>
      </div>

      {idStatus !== 'approved' && (
        <div className="mt-6">
          <Notice tone="warning" title={t('search.idNeededTitle')}>
            <p>{idStatus === 'pending' ? t('search.idPendingBody') : t('search.idNeededBody')}</p>
            {idStatus !== 'pending' && (
              <p className="mt-2">
                <Link className="link font-semibold" href="/account#id-check">
                  {t('search.idCta')}
                </Link>
              </p>
            )}
          </Notice>
        </div>
      )}

      {workers.length === 0 ? (
        <EmptyState title={t('search.emptyTitle')} body={t('search.emptyBody')} action={<ButtonLink href={back}>{t('search.change')}</ButtonLink>} />
      ) : (
        <ul>
          {workers.map((w) => {
            const rating = (w.ratingAvgX100 / 100).toFixed(1);
            return (
              <li key={w.id} className="grid gap-4 border-b border-rule py-6 hover:bg-paper-2 md:grid-cols-12 md:items-center md:px-3">
                <div className="flex gap-4 md:col-span-7">
                  <Avatar name={w.displayName} size={64} />
                  <div className="min-w-0">
                    <h2 className="font-display text-h4 font-semibold">
                      <Link href={`/workers/${w.id}?${toQuery(sp)}`} className="hover:underline">
                        {w.displayName}
                      </Link>
                    </h2>
                    <p className="text-small text-ink-2">
                      {w.distanceKm != null && (
                        <span className="font-semibold text-ink">
                          {w.distanceKm < 1 ? t('location.awayNear') : t('location.awayKm', { km: Math.round(w.distanceKm) })}.{' '}
                        </span>
                      )}
                      {t('search.experience', { n: w.yearsExperience })}. {t('search.languages', { languages: w.languages.join(', ') })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {docs.requireKyc && <VerifiedBadge>{t('badges.id')}</VerifiedBadge>}
                      {docs.requirePoliceVerification && <VerifiedBadge>{t('badges.police')}</VerifiedBadge>}
                      {docs.documents.some((d) => d.type === 'driving_licence') && <VerifiedBadge>{t('badges.licence')}</VerifiedBadge>}
                      {docs.documents.some((d) => d.type === 'nursing_registration') && <VerifiedBadge>{t('badges.nursing')}</VerifiedBadge>}
                      {docs.documents.some((d) => d.type === 'caregiver_training') && <VerifiedBadge>{t('badges.caregiver')}</VerifiedBadge>}
                    </div>
                    <p className="mt-2 text-small">
                      {w.ratingCount === 0
                        ? t('search.newOnSaathi')
                        : w.ratingCount === 1
                          ? t('search.ratingOne', { rating })
                          : t('search.rating', { rating, n: w.ratingCount })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 md:col-span-5 md:justify-end">
                  <div className="text-right">
                    <p className="text-small text-ink-2">{t('search.total', { hours })}</p>
                    <p className="font-display text-h3 font-bold tabular">{formatInr(result.quote!.customer.totalPaise)}</p>
                  </div>
                  <ButtonLink href={`/book/${service}/confirm?${toQuery(sp, { worker: w.id, page: String(input.page) })}`}>
                    {t('search.choose')}
                    <span className="sr-only"> {w.displayName}</span>
                  </ButtonLink>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hasMore && (
        <Link className="link mt-6 inline-block" href={`/book/${service}?${toQuery(sp, { page: String(input.page + 1) })}`}>
          {t('search.more')}
        </Link>
      )}
    </Container>
  );
}
