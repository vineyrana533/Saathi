import { SiteFooter, SiteHeader } from '@/ui/site-chrome';
import { pageSession, STAFF } from '../_lib/session';
import { listCities } from '@/modules/geo/service';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [{ session }, cities] = await Promise.all([pageSession(), listCities()]);
  const roles = session?.roles ?? [];
  return (
    <>
      <SiteHeader user={{ signedIn: !!session, isWorker: roles.includes('worker'), isStaff: roles.some((r) => STAFF.includes(r)) }} />
      <main id="main">{children}</main>
      <SiteFooter liveCities={cities.filter((c) => c.status === 'live').map((c) => ({ slug: c.slug, name: c.name }))} />
    </>
  );
}
