import { z } from 'zod';
import { api, jsonBody } from '@/platform/http';
import { startJob } from '@/modules/bookings/service';

export const POST = api<{ id: string }>(async (req, { ctx, params }) => {
  const { code } = z.object({ code: z.string() }).parse(await jsonBody(req));
  return startJob(ctx, params.id, code);
});
