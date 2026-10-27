import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { t } from '@/i18n';
import { getPublicWorkerProfile } from '@/modules/bookings/service';
import { workerReviews } from '@/modules/reviews/service';
import { formatIst } from '@/platform/time';
import { ReportForm } from '@/ui/booking-parts';
import { Avatar, Container, VerifiedBadge } from '@/ui/primitives';
import { reportAction } from '../../../_lib/booking-actions';
import { pageSession } from '../../../_lib/session';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const w = await getPublicWorkerProfile(id);
  // Worker profiles are noindex unless the worker opts in (section 13, privacy).
  return { title: w ? `${w.displayName} | Saathi` : 'Saathi', robots: { index: !!w?.searchIndexOptIn, follow: false } };
}

export default async function WorkerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [w, reviews, { session }] = await Promise.all([getPublicWorkerProfile(id), workerReviews(id), pageSession()]);
  if (!w) notFound();
  const rating = (w.ratingAvgX100 / 100).toFixed(1);
  return (
    <Container className="max-w-4xl pb-16 pt-10">
      <div className="flex flex-col gap-6 sm:flex-row">
        <Avatar name={w.displayName} size={160} />
        <div>
          <h1 className="font-display text-h1 font-bold">{w.displayName}</h1>
          <p className="mt-2 text-ink-2">
            {w.homeCity ? `${w.homeCity}. ` : ''}
            {t('search.experience', { n: w.yearsExperience })}. {t('search.languages', { languages: w.languages.join(', ') })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {w.kycStatus === 'verified' && <VerifiedBadge>{t('badges.id')}</VerifiedBadge>}
          </div>
          <p className="mt-3">{w.ratingCount === 0 ? t('search.newOnSaathi') : w.ratingCount === 1 ? t('search.ratingOne', { rating }) : t('search.rating', { rating, n: w.ratingCount })}</p>
        </div>
      </div>
      {w.bio && <p className="mt-8 text-body-l prose-measure">{w.bio}</p>}
      {reviews.length > 0 && (
        <section className="mt-12" aria-labelledby="reviews-title">
          <h2 id="reviews-title" className="font-display text-h3 font-semibold">
            {t('booking.reviewsTitle')}
          </h2>
          <ul className="mt-4 border-t border-ink">
            {reviews.map((r, i) => (
              <li key={i} className="border-b border-rule py-4">
                <p aria-label={t('booking.stars', { n: r.score })}>
                  <span aria-hidden="true">{'★'.repeat(r.score)}</span>
                </p>
                {r.comment && <p className="mt-1">{r.comment}</p>}
                <p className="mt-1 text-small text-ink-3">{formatIst(r.createdAt, { dateStyle: 'medium' })}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-10 text-small text-ink-3">{t('common.noIndexNote')}</p>
      {session && (
        <div className="mt-6">
          <ReportForm entityType="worker_profile" entityId={w.id} action={reportAction} />
        </div>
      )}
    </Container>
  );
}
