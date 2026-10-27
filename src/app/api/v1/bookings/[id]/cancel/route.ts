import { z } from 'zod';
import { api, jsonBody } from '@/platform/http';
import { cancelBooking } from '@/modules/bookings/service';

export const POST = api<{ id: string }>(async (req, { ctx, params }) => {
  const body = z.object({ reason: z.string().max(300), feltUnsafe: z.boolean().optional() }).parse(await jsonBody(req));
  return cancelBooking(ctx, { bookingId: params.id, reason: body.reason, feltUnsafe: body.feltUnsafe });
});
