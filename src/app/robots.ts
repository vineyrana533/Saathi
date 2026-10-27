import type { MetadataRoute } from 'next';
import { env } from '@/platform/env';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const base = env().SITE_URL.replace(/\/$/, '');
  // Staging and local must never be indexed.
  if (env().APP_ENV !== 'production') return { rules: [{ userAgent: '*', disallow: '/' }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/worker', '/account', '/bookings', '/checkout', '/sign-in'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
