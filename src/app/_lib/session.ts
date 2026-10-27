import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { resolveSession } from '@/modules/identity/service';
import { ctxFromSession, SESSION_COOKIE } from '@/platform/http';
import type { Role } from '@/modules/identity/schema';

/** Session for the current page request, resolved once per render. */
export const pageSession = cache(async () => {
  const jar = await cookies();
  const session = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  return { session, ctx: ctxFromSession(session, randomUUID()) };
});

export async function requireSession(next: string) {
  const s = await pageSession();
  if (!s.session) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  return { session: s.session, ctx: s.ctx };
}

export async function requireAnyRole(roles: Role[], next: string) {
  const s = await requireSession(next);
  if (!s.session.roles.some((r) => roles.includes(r))) redirect('/');
  return s;
}

export const STAFF: Role[] = ['admin', 'ops', 'verifier', 'finance', 'support'];
