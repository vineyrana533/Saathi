import { z } from 'zod';
import { api, jsonBody } from '@/platform/http';
import { finishJob } from '@/modules/bookings/service';

export const POST = api<{ id: string }>(async (req, { ctx, params }) => {
  const { code } = z.object({ code: z.string() }).parse(await jsonBody(req));
  return finishJob(ctx, params.id, code);
});
