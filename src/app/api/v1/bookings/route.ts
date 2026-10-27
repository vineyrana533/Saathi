import { api, jsonBody } from '@/platform/http';
import { createBooking, listMyBookings } from '@/modules/bookings/service';
import { createBookingInput } from '@/modules/bookings/validation';

export const GET = api(async (_req, { ctx }) => ({ bookings: await listMyBookings(ctx) }));

export const POST = api(async (req, { ctx }) => {
  const input = createBookingInput.parse(await jsonBody(req));
  const out = await createBooking(ctx, input);
  return Response.json(out, { status: 201 });
});
