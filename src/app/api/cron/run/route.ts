import { timingSafeEqual } from 'node:crypto';
import { runAllSweeps } from '@/modules/jobs/service';
import { env } from '@/platform/env';

/** Called by Vercel Cron (GET with `Authorization: Bearer <CRON_SECRET>`) or manually. */
export async function GET(req: Request) {
  const given = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return Response.json(await runAllSweeps(), { headers: { 'Cache-Control': 'no-store' } });
}

export const POST = GET;
