import Link from 'next/link';
import { redirect } from 'next/navigation';
import { t } from '@/i18n';
import { getMyWorkerProfile } from '@/modules/workers/service';
import { listWorkerJobs } from '@/modules/bookings/service';
import { formatIst } from '@/platform/time';
import { StatusPill } from '@/ui/booking-parts';
import { EmptyState, PageHeading, Pill } from '@/ui/primitives';
import { requireSession } from '../_lib/session';

export default async function WorkerHome() {
  const { ctx, session } = await requireSession('/worker');
  const mine = await getMyWorkerProfile(ctx);
  if (!mine || !session.roles.includes('worker')) redirect('/worker/profile');
  const jobs = await listWorkerJobs(ctx);
  const p = mine.profile;
  const hasDoc = (type: string) => mine.documents.some((d) => d.docType === type && d.status !== 'rejected');
  const steps = [
    { label: t('worker.stepProfile'), done: mine.zoneIds.length > 0, href: '/worker/profile' },
    { label: t('worker.stepDocuments'), done: ['driving_licence', 'police_certificate', 'id_proof', 'profile_photo'].every(hasDoc), href: '/worker/documents' },
    { label: t('worker.stepService'), done: mine.approvals.length > 0, href: '/worker/documents#services' },
    { label: t('worker.stepHours'), done: mine.hours.length > 0, href: '/worker/availability' },
  ];
  const statusLabel = p.status === 'active' ? t('worker.statusActive') : p.status === 'suspended' ? t('worker.statusSuspended') : t('worker.statusApplicant');
  const upcoming = jobs.filter((j) => j.status === 'confirmed' || j.status === 'in_progress');
  const past = jobs.filter((j) => !(j.status === 'confirmed' || j.status === 'in_progress'));

  return (
    <>
      <PageHeading title={t('worker.title')} lede={<Pill tone={p.status === 'active' ? 'success' : p.status === 'suspended' ? 'danger' : 'warning'}>{statusLabel}</Pill>} />
      {p.status !== 'active' && (
        <section aria-labelledby="checklist" className="mb-10">
          <h2 id="checklist" className="font-display text-h3 font-semibold">
            {t('worker.checklist')}
          </h2>
          <ul className="mt-4 border-t border-ink">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-4 border-b border-rule py-4">
                <Link href={s.href} className="font-semibold hover:underline">
                  {s.label}
                </Link>
                <Pill tone={s.done ? 'success' : 'warning'}>{s.done ? t('worker.done') : t('worker.todo')}</Pill>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="upcoming">
        <h2 id="upcoming" className="font-display text-h3 font-semibold">
          {t('worker.upcoming')}
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-ink-2">{t('worker.noJobs')}</p>
        ) : (
          <JobList jobs={upcoming} />
        )}
      </section>
      {past.length > 0 && (
        <section className="mt-10">
          <JobList jobs={past} />
        </section>
      )}
      {jobs.length === 0 && p.status === 'active' && <EmptyState title={t('worker.upcoming')} body={t('worker.noJobs')} />}
    </>
  );
}

function JobList({ jobs }: { jobs: Awaited<ReturnType<typeof listWorkerJobs>> }) {
  return (
    <ul className="mt-4 border-t border-ink">
      {jobs.map((j) => (
        <li key={j.id} className="border-b border-rule py-4">
          <Link href={`/worker/jobs/${j.id}`} className="flex min-h-11 flex-col gap-1 hover:underline">
            <span className="font-semibold">
              {formatIst(j.startsAt)}, {j.zoneName}
            </span>
            <span className="text-small text-ink-2">
              {j.serviceName} · {t('worker.jobTitle', { ref: j.ref })}
            </span>
          </Link>
          <div className="mt-2">
            <StatusPill status={j.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}
