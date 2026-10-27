import type { MetadataRoute } from 'next';
import { cityServiceSitemapEntries } from '@/modules/seo/service';
import { env } from '@/platform/env';

/**
 * Generated per request from the database, so a city-service page appears the moment it goes
 * live and disappears the moment supply drops below the threshold. Worker profiles are excluded
 * (noindex by default for privacy).
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().SITE_URL.replace(/\/$/, '');
  const entries = await cityServiceSitemapEntries();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/work-with-us`, changeFrequency: 'monthly', priority: 0.5 },
    ...entries.map((e) => ({ url: `${base}${e.path}`, lastModified: e.lastModified, changeFrequency: 'daily' as const, priority: 0.8 })),
  ];
}
