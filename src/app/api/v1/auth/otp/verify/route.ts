import { z } from 'zod';
import { api, jsonBody, sessionCookieHeader } from '@/platform/http';
import { SESSION_TTL_DAYS, verifyLoginOtp } from '@/modules/identity/service';
import { env } from '@/platform/env';

/** Web clients get an httpOnly cookie; mobile clients use the returned token as a Bearer token. */
export const POST = api(async (req) => {
  const body = z.object({ phone: z.string().min(10).max(20), code: z.string() }).parse(await jsonBody(req));
  const out = await verifyLoginOtp({ phone: body.phone, code: body.code, userAgent: req.headers.get('user-agent') });
  const res = Response.json({ token: out.token, userId: out.userId, isNew: out.isNew });
  res.headers.append(
    'Set-Cookie',
    sessionCookieHeader(out.token, SESSION_TTL_DAYS * 86400, env().SITE_URL.startsWith('https://')),
  );
  return res;
});
