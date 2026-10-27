import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { anonymousCtx, type Ctx } from './db/client';
import { isAppError } from './errors';
import { log } from './logger';
import { resolveSession, type SessionUser } from '../modules/identity/service';

export const SESSION_COOKIE = 'saathi_session';

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Session token from `Authorization: Bearer` (mobile apps) or the httpOnly cookie (web). */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return readCookie(req.headers.get('cookie'), SESSION_COOKIE);
}

export function ctxFromSession(session: SessionUser | null, requestId: string = randomUUID()): Ctx {
  if (!session) return anonymousCtx(requestId);
  return { userId: session.userId, roles: session.roles, requestId };
}

export async function requestCtx(req: Request): Promise<{ ctx: Ctx; session: SessionUser | null }> {
  const requestId = req.headers.get('x-request-id') ?? randomUUID();
  const session = await resolveSession(tokenFromRequest(req));
  return { ctx: ctxFromSession(session, requestId), session };
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

export function errorResponse(e: unknown): Response {
  if (isAppError(e)) {
    return Response.json({ error: { code: e.code, message: e.message, details: e.details ?? null } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    return Response.json(
      { error: { code: 'invalid_input', message: e.issues[0]?.message ?? 'Check the form and try again', details: { issues: e.issues } } },
      { status: 422 },
    );
  }
  if (e instanceof SyntaxError) {
    return Response.json({ error: { code: 'invalid_json', message: 'Request body must be JSON', details: null } }, { status: 400 });
  }
  log.error('unhandled API error', { error: e });
  return Response.json({ error: { code: 'internal', message: 'Something went wrong on our side. Please try again.', details: null } }, { status: 500 });
}

type Handler<P> = (req: Request, args: { ctx: Ctx; session: SessionUser | null; params: P }) => Promise<Response | unknown>;

/** Wraps a route handler: resolves the session, maps errors, sets no-store. */
export function api<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: Request, route: { params: Promise<P> }): Promise<Response> => {
    try {
      const { ctx, session } = await requestCtx(req);
      const params = route?.params ? await route.params : ({} as P);
      const out = await handler(req, { ctx, session, params });
      const res = out instanceof Response ? out : Response.json(out ?? { ok: true });
      res.headers.set('Cache-Control', 'no-store');
      return res;
    } catch (e) {
      const res = errorResponse(e);
      res.headers.set('Cache-Control', 'no-store');
      return res;
    }
  };
}

export async function jsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > 64_000) throw new SyntaxError('body too large');
  return text ? JSON.parse(text) : {};
}

export function sessionCookieHeader(token: string, maxAgeSeconds: number, secure: boolean) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
}
