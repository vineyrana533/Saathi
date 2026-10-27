import { z } from 'zod';
import { api, jsonBody } from '@/platform/http';
import { payWithSandbox } from '@/modules/payments/service';

/** Sandbox checkout only. No real money moves. Unavailable once live payments are approved. */
export const POST = api<{ id: string }>(async (req, { ctx, params }) => {
  const body = z.object({ outcome: z.enum(['captured', 'failed']).default('captured') }).parse(await jsonBody(req));
  return payWithSandbox(ctx, params.id, body.outcome);
});
