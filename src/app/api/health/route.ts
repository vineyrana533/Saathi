import { sql } from 'drizzle-orm';
import { anonymousCtx, withDb } from '@/platform/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    await withDb(anonymousCtx(), (tx) => tx.execute(sql`select 1`));
    return Response.json({ ok: true, db: 'up', ms: Date.now() - started }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, db: 'down' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
