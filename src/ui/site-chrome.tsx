import Link from 'next/link';
import { t } from '@/i18n';
import { MobileMenu } from './mobile-menu';
import { ButtonLink, Container } from './primitives';

export interface HeaderUser {
  signedIn: boolean;
  isWorker: boolean;
  isStaff: boolean;
}

export function SiteHeader({ user }: { user: HeaderUser }) {
  const links = [
    { href: '/#services', label: t('nav.services') },
    { href: '/how-it-works', label: t('nav.howItWorks') },
    { href: '/how-it-works#safety', label: t('nav.safety') },
    { href: '/work-with-us', label: t('nav.workWithUs') },
  ];
  const accountLinks = user.signedIn
    ? [
        { href: '/bookings', label: t('nav.bookings') },
        ...(user.isWorker ? [{ href: '/worker', label: t('nav.workerPortal') }] : []),
        ...(user.isStaff ? [{ href: '/admin', label: t('nav.admin') }] : []),
        { href: '/account', label: t('nav.account') },
      ]
    : [{ href: '/sign-in', label: t('nav.logIn') }];
  const cta = { href: '/#services', label: t('nav.book') };
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper">
      <Container className="flex h-16 items-center justify-between gap-6 lg:h-[72px]">
        <Link href="/" className="font-display text-h3 font-bold tracking-tight">
          {t('brand.name')}
        </Link>
        <nav aria-label={t('a11y.mainNav')} className="hidden lg:block">
          <ul className="flex items-center gap-6 text-small font-semibold">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="py-2 hover:underline hover:underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-4">
          <ul className="hidden items-center gap-4 text-small font-semibold lg:flex">
            {accountLinks.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="py-2 hover:underline hover:underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <span className="hidden lg:block">
            <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
          </span>
          <MobileMenu links={[...links, ...accountLinks]} cta={cta} labels={{ menu: t('a11y.menu'), close: t('a11y.close') }} />
        </div>
      </Container>
    </header>
  );
}

export function SiteFooter({ liveCities }: { liveCities: { slug: string; name: string }[] }) {
  return (
    <footer className="on-dark mt-section bg-ink text-ink-on-dark">
      <Container className="py-16 md:py-24">
        <p className="font-display text-display-l font-bold text-balance">
          {t('footer.statementBefore')} <span className="font-accent font-normal italic">{t('footer.statementAccent')}</span>
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/#services">{t('footer.book')}</ButtonLink>
          <ButtonLink href="/work-with-us" variant="onDark">
            {t('footer.apply')}
          </ButtonLink>
        </div>
        <div className="mt-16 grid gap-10 border-t border-ink-on-dark-2/40 pt-10 sm:grid-cols-2 lg:grid-cols-4">
          <FooterCol title={t('footer.servicesTitle')} links={[{ href: '/delhi/personal-driver', label: 'Personal driver' }, { href: '/delhi/event-staff', label: 'Event and business staff' }, { href: '/delhi/errands', label: 'Errands and appointment help' }, { href: '/delhi/elder-care', label: 'Elder care' }, { href: '/delhi/domestic-help', label: 'Domestic help' }, { href: '/delhi/medical-support', label: 'Medical support at home' }, { href: '/request', label: t('home.otherTitle') }]} />
          <FooterCol
            title={t('footer.citiesTitle')}
            links={[...liveCities.map((c) => ({ href: `/${c.slug}/personal-driver`, label: c.name })), { href: '/mumbai/personal-driver', label: t('footer.mumbaiSoon') }]}
          />
          <FooterCol title={t('footer.helpTitle')} links={[{ href: '/how-it-works', label: t('nav.howItWorks') }, { href: '/how-it-works#safety', label: t('nav.safety') }, { href: '/code-of-conduct', label: t('footer.codeOfConduct') }, { href: '/work-with-us', label: t('nav.workWithUs') }]} />
          <div className="text-small text-ink-on-dark-2">
            <h2 className="eyebrow mb-3 text-ink-on-dark-2">{t('footer.legalTitle')}</h2>
            <p>{t('footer.grievance')}</p>
            <p className="mt-2">{t('footer.support')}</p>
            <p className="mt-2">{t('footer.entity')}</p>
            <p className="mt-2">{t('footer.pricesNote')}</p>
          </div>
        </div>
      </Container>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="eyebrow mb-3 text-ink-on-dark-2">{title}</h2>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:underline hover:underline-offset-4">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
