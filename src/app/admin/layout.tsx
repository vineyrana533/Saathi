import Link from 'next/link';
import type { Metadata } from 'next';
import { Container } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../_lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Operations | Saathi', robots: { index: false, follow: false } };

/** Internal staff tool. English only (internal users); customer and worker UI goes through i18n. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireAnyRole(STAFF, '/admin');
  const links = [
    ['/admin', 'Overview'],
    ['/admin/verification', 'Verification'],
    ['/admin/workers', 'Workers'],
    ['/admin/requests', 'Requests and quotes'],
    ['/admin/bookings', 'Bookings'],
    ['/admin/catalog', 'Services and prices'],
    ['/admin/moderation', 'Moderation'],
    ['/admin/waitlist', 'Waitlist and requests'],
  ];
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-rule bg-ink text-ink-on-dark on-dark">
        <Container className="flex h-14 items-center justify-between">
          <Link href="/admin" className="font-display text-h4 font-bold">
            Saathi operations
          </Link>
          <p className="text-small text-ink-on-dark-2">Roles: {session.roles.join(', ')}</p>
        </Container>
      </header>
      <nav aria-label="Operations" className="overflow-x-auto border-b border-rule">
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
      <main id="main">
        <Container className="pb-16 pt-8">{children}</Container>
      </main>
    </div>
  );
}
