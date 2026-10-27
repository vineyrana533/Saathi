import { api, jsonBody } from '@/platform/http';
import { rateBooking, ratingInput } from '@/modules/reviews/service';

export const POST = api<{ id: string }>(async (req, { ctx, params }) => rateBooking(ctx, params.id, ratingInput.parse(await jsonBody(req))));
