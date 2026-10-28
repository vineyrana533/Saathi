import { and, eq, lt, sql } from 'drizzle-orm';
import { workerDocuments, workerServiceApprovals, workerProfiles } from '../workers/schema';
import { serviceConfigSchema } from '../catalog/config';
import { services } from '../catalog/schema';
import { expireStaleHolds } from '../bookings/service';
import { applyRequestExpiry } from '../requests/assisted';
import { dispatchPending, enqueueNotification } from '../notifications/service';
import { systemCtx, withDb } from '@/platform/db/client';
import { audit } from '@/platform/audit';
import { todayIst } from '@/platform/time';
import { log } from '@/platform/logger';

/**
 * Recurring sweeps (docs/system-architecture.md section 6). Each is idempotent and safe to run
 * any time; correctness of search never depends on them because eligibility checks dates directly.
 */
export async function expirePaymentHolds() {
  return withDb(systemCtx(), (tx) => expireStaleHolds(tx));
}

/**
 * Marks expired documents and suspends approvals for services that require them,
 * then tells the worker. Search already hides them by date; this keeps statuses honest.
 */
export async function documentExpirySweep() {
  const ctx = systemCtx();
  return withDb(ctx, async (tx) => {
    const expired = await tx
      .update(workerDocuments)
      .set({ status: 'expired' })
      .where(and(eq(workerDocuments.status, 'approved'), lt(workerDocuments.expiresOn, todayIst())))
      .returning({ id: workerDocuments.id, workerId: workerDocuments.workerId, docType: workerDocuments.docType });
    let suspended = 0;
    for (const doc of expired) {
      const approvals = await tx
        .select({ id: workerServiceApprovals.id, config: services.config, slug: services.slug })
        .from(workerServiceApprovals)
        .innerJoin(services, eq(services.id, workerServiceApprovals.serviceId))
        .where(and(eq(workerServiceApprovals.workerId, doc.workerId), eq(workerServiceApprovals.status, 'approved')));
      for (const a of approvals) {
        const cfg = serviceConfigSchema.parse(a.config);
        const needs = cfg.workerRequirements.documents.some((d) => d.type === doc.docType) ||
          (doc.docType === 'police_certificate' && cfg.workerRequirements.requirePoliceVerification);
        if (!needs) continue;
        // Suspend only if no other approved, valid document of that type exists.
        const [still] = await tx.execute<{ n: number }>(sql`
          select count(*)::int as n from worker_documents
          where worker_id = ${doc.workerId} and doc_type = ${doc.docType} and status = 'approved'
            and (expires_on is null or expires_on >= ${todayIst()}::date)`);
        if (Number(still?.n ?? 0) > 0) continue;
        await tx
          .update(workerServiceApprovals)
          .set({ status: 'suspended', reason: `${doc.docType.replace('_', ' ')} expired` })
          .where(eq(workerServiceApprovals.id, a.id));
        suspended++;
      }
      const [wp] = await tx.select({ userId: workerProfiles.userId }).from(workerProfiles).where(eq(workerProfiles.id, doc.workerId));
      if (wp) {
        await enqueueNotification(tx, {
          channel: 'sms',
          userId: wp.userId,
          template: 'document_expired',
          payload: { docType: doc.docType },
          idempotencyKey: `doc-expired:${doc.id}`,
        });
      }
      await audit(tx, ctx, 'worker.document_expired', 'worker_document', doc.id, { docType: doc.docType });
    }
    return { expired: expired.length, suspended };
  });
}

export async function dispatchNotifications() {
  return withDb(systemCtx(), (tx) => dispatchPending(tx));
}

/** Expires sent quotes past their validity and open requests whose start has passed. */
export async function expireQuotesAndRequests() {
  return withDb(systemCtx(), (tx) => applyRequestExpiry(tx));
}

export async function runAllSweeps() {
  const results: Record<string, unknown> = {};
  for (const [name, fn] of [
    ['expirePaymentHolds', expirePaymentHolds],
    ['expireQuotesAndRequests', expireQuotesAndRequests],
    ['documentExpirySweep', documentExpirySweep],
    ['dispatchNotifications', dispatchNotifications],
  ] as const) {
    try {
      results[name] = await fn();
    } catch (e) {
      log.error('sweep failed', { name, error: e });
      results[name] = { error: true };
    }
  }
  return results;
}
