import { api } from '@/platform/http';
import { unauthenticated } from '@/platform/errors';
import { maskPhone } from '@/platform/auth/phone';

export const GET = api(async (_req, { session }) => {
  if (!session) throw unauthenticated();
  return { userId: session.userId, displayName: session.displayName, phone: maskPhone(session.phoneE164), roles: session.roles };
});
