import Link from 'next/link';
import { moderationQueue } from '@/modules/chat/service';
import { can } from '@/platform/auth/permissions';
import { formatIst } from '@/platform/time';
import { EmptyState, Notice, Pill } from '@/ui/primitives';
import { requireAnyRole, STAFF } from '../../_lib/session';

export default async function ModerationPage() {
  const { ctx } = await requireAnyRole(STAFF, '/admin/moderation');
  if (!can(ctx, 'chat.moderate')) return <Notice tone="warning">Your role cannot moderate content.</Notice>;
  const q = await moderationQueue(ctx);
  return (
    <>
      <h1 className="font-display text-h1 font-bold">Moderation</h1>
      <p className="mt-2 text-ink-2">Blocked and held chat messages, low ratings and user reports. Resolving items is a Milestone 3 feature; this view is read-only for now.</p>
      <section className="mt-8" aria-labelledby="flags">
        <h2 id="flags" className="font-display text-h2 font-bold">
          Flags ({q.flags.length})
        </h2>
        {q.flags.length === 0 ? (
          <EmptyState title="No open flags" body="Blocked messages and low ratings appear here." />
        ) : (
          <ul className="mt-4 border-t border-ink">
            {q.flags.map(({ flag, body, bookingId }) => (
              <li key={flag.id} className="border-b border-rule py-4">
                <p className="flex flex-wrap items-center gap-2">
                  <Pill tone={flag.severity === 'block' ? 'danger' : 'warning'}>{flag.severity}</Pill>
                  <span className="font-semibold">{flag.entityType.replace('_', ' ')}</span>
                  <span className="text-small text-ink-2">{flag.reasons.join(', ')}</span>
                  <span className="text-small text-ink-3">{formatIst(flag.createdAt)}</span>
                </p>
                {body && <p className="mt-1 text-small">&ldquo;{body}&rdquo;</p>}
                {bookingId && (
                  <Link className="link text-small" href={`/admin/bookings/${bookingId}`}>
                    Open booking
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-12" aria-labelledby="reports">
        <h2 id="reports" className="font-display text-h2 font-bold">
          Reports ({q.reports.length})
        </h2>
        <ul className="mt-4 border-t border-ink">
          {q.reports.map((r) => (
            <li key={r.id} className="border-b border-rule py-4">
              <p className="font-semibold">
                {r.reason.replace(/_/g, ' ')} on {r.entityType.replace('_', ' ')}
              </p>
              {r.details && <p className="text-small">{r.details}</p>}
              <p className="text-small text-ink-3">{formatIst(r.createdAt)}</p>
              {r.entityType === 'booking' && (
                <Link className="link text-small" href={`/admin/bookings/${r.entityId}`}>
                  Open booking
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
