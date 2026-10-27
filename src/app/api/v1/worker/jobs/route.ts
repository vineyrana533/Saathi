import { api } from '@/platform/http';
import { listWorkerJobs } from '@/modules/bookings/service';

export const GET = api(async (_req, { ctx }) => ({ jobs: await listWorkerJobs(ctx) }));
