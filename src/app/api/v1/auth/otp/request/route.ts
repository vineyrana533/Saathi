import { z } from 'zod';
import { api, clientIp, jsonBody } from '@/platform/http';
import { requestLoginOtp } from '@/modules/identity/service';

export const POST = api(async (req) => {
  const { phone } = z.object({ phone: z.string().min(10).max(20) }).parse(await jsonBody(req));
  const out = await requestLoginOtp({ phone, ip: clientIp(req) });
  return { expiresInSeconds: out.expiresInSeconds, sandbox: out.sandbox };
});
