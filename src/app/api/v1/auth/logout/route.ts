import { api, sessionCookieHeader, tokenFromRequest } from '@/platform/http';
import { revokeSession } from '@/modules/identity/service';

export const POST = api(async (req) => {
  const token = tokenFromRequest(req);
  if (token) await revokeSession(token);
  const res = Response.json({ ok: true });
  res.headers.append('Set-Cookie', sessionCookieHeader('', 0, false));
  return res;
});
