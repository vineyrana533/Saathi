import { auditLog } from './db/platform-schema';
import type { Ctx, Tx } from './db/client';
import { redact } from './logger';

/** Writes an append-only audit entry inside the caller's transaction. Data is redacted first. */
export async function audit(
  tx: Tx,
  ctx: Ctx,
  action: string,
  entityType: string,
  entityId: string | null,
  data: Record<string, unknown> = {},
) {
  await tx.insert(auditLog).values({
    actorUserId: ctx.userId,
    actorRoles: ctx.roles.join(','),
    action,
    entityType,
    entityId,
    requestId: ctx.requestId,
    data: redact(data) as Record<string, unknown>,
  });
}
