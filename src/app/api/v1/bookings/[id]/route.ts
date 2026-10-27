import { api } from '@/platform/http';
import { getBookingForViewer } from '@/modules/bookings/service';

export const GET = api<{ id: string }>(async (_req, { ctx, params }) => getBookingForViewer(ctx, params.id));
