import { api, jsonBody } from '@/platform/http';
import { createReport, reportInput } from '@/modules/chat/service';

export const POST = api(async (req, { ctx }) => Response.json(await createReport(ctx, reportInput.parse(await jsonBody(req))), { status: 201 }));
