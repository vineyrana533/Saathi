import Link from 'next/link';
import type { Metadata } from 'next';
import { t } from '@/i18n';
import { Container } from '@/ui/primitives';
import { requireSession } from '../_lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: t('worker.title'), robots: { index: false, follow: false } };

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireSession('/worker');
  const isWorker = session.roles.includes('worker');
  const links = isWorker
    ? [
        ['/worker', t('worker.jobsTitle')],
        ['/worker/profile', t('worker.profileTitle')],
        ['/worker/documents', t('worker.documentsTitle')],
        ['/worker/availability', t('worker.hoursTitle')],
        ['/worker/earnings', t('worker.earnings')],
      ]
    : [['/worker/profile', t('worker.profileTitle')]];
  return (
    <>
      <header className="border-b border-rule bg-paper">
        <Container className="flex h-14 items-center justify-between">
          <Link href="/" className="font-display text-h4 font-bold">
            {t('brand.name')}
          </Link>
          <Link href="/account" className="text-small font-semibold">
            {t('nav.account')}
          </Link>
        </Container>
        <nav aria-label={t('worker.title')} className="overflow-x-auto">
          <Container>
            <ul className="flex gap-1 whitespace-nowrap">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href!} className="inline-flex min-h-11 items-center px-3 text-small font-semibold hover:bg-paper-2">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </nav>
      </header>
      <main id="main">
        <Container className="max-w-3xl pb-16">{children}</Container>
      </main>
    </>
  );
}
