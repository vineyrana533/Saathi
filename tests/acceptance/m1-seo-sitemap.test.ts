/**
 * M1 acceptance: the new city-service page appears in the sitemap within one deploy of going live,
 * and is noindex when supply falls below the threshold. The sitemap is generated per request
 * from the database, so "within one deploy" holds with zero deploys.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { getCityServicePage } from '@/modules/seo/service';
import { createDriver, createTestCity, ownerSql } from '../helpers/fixtures';

describe('M1 SEO and sitemap', () => {
  let t: Awaited<ReturnType<typeof createTestCity>>;
  beforeAll(async () => {
    t = await createTestCity({ threshold: 2 });
  });

  const inSitemap = async () => (await sitemap()).some((e) => e.url.endsWith(`/${t.city.slug}/personal-driver`));

  it('is noindex and absent from the sitemap below the threshold, indexable and listed at it', async () => {
    const first = await createDriver({ zoneIds: [t.zone.id] });
    let page = await getCityServicePage(t.city.slug, 'personal-driver');
    expect(page!.supply).toMatchObject({ verifiedWorkers: 1, threshold: 2, live: false });
    expect(page!.indexable).toBe(false);
    expect(await inSitemap()).toBe(false);

    const second = await createDriver({ zoneIds: [t.zone.id] });
    page = await getCityServicePage(t.city.slug, 'personal-driver');
    expect(page!.indexable).toBe(true);
    expect(await inSitemap()).toBe(true);

    // Supply drops: one licence expires.
    const sql = ownerSql();
    try {
      await sql`update worker_documents set expires_on = current_date - 1 where worker_id = ${second.worker.id} and doc_type = 'driving_licence'`;
    } finally {
      await sql.end();
    }
    page = await getCityServicePage(t.city.slug, 'personal-driver');
    expect(page!.indexable).toBe(false);
    expect(await inSitemap()).toBe(false);
    expect(first.worker.id).toBeTruthy();
  });

  it('does not publish pages for Tier B categories while their flag is off', async () => {
    expect(await getCityServicePage('delhi', 'social-companion')).toBeNull();
  });

  it('keeps a paused city-service out of the sitemap regardless of supply', async () => {
    const paused = await createTestCity({ threshold: 1, status: 'waitlist' });
    await createDriver({ zoneIds: [paused.zone.id] });
    const entries = await sitemap();
    expect(entries.some((e) => e.url.endsWith(`/${paused.city.slug}/personal-driver`))).toBe(false);
    const page = await getCityServicePage(paused.city.slug, 'personal-driver');
    expect(page!.indexable).toBe(false);
  });
});
