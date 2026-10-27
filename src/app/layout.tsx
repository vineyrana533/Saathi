import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Instrument_Serif, Public_Sans } from 'next/font/google';
import './globals.css';
import { HTML_LANG, DEFAULT_LOCALE, t } from '@/i18n';
import { env } from '@/platform/env';

const display = Bricolage_Grotesque({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-bricolage', display: 'swap' });
const accent = Instrument_Serif({ subsets: ['latin'], weight: '400', style: 'italic', variable: '--font-instrument', display: 'swap', preload: false });
const sans = Public_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-public-sans', display: 'swap' });

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(env().SITE_URL),
    title: { default: t('home.metaTitle'), template: '%s' },
    description: t('home.metaDescription'),
    // Staging and local are never indexed; production pages decide individually.
    robots: env().APP_ENV === 'production' ? undefined : { index: false, follow: false },
  };
}

export const viewport: Viewport = { themeColor: '#F6F1E8', width: 'device-width', initialScale: 1 };

/** Shown on every page while any adapter is simulated (design-system.md 6.15). */
function SandboxBanner() {
  const e = env();
  const simulated = e.PAYMENTS_MODE === 'sandbox' || e.SMS_PROVIDER === 'dev-log' || e.DOCUMENT_STORE === 'local-encrypted';
  if (!simulated) return null;
  return (
    <div role="note" className="border-b border-warning bg-marigold-tint px-4 py-2 text-center text-small font-semibold text-ink">
      {t('sandbox.banner')}
    </div>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={HTML_LANG[DEFAULT_LOCALE]} className={`${display.variable} ${accent.variable} ${sans.variable}`}>
      <body className="min-h-dvh bg-paper text-ink">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-3 focus:text-ink-on-dark">
          {t('a11y.skip')}
        </a>
        <SandboxBanner />
        {children}
      </body>
    </html>
  );
}
