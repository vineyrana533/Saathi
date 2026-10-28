/**
 * Password gate for the staging site (HTTP Basic auth). Staging uses test accounts with a known
 * login code, including an admin, so the whole site sits behind one shared password.
 * Active only when STAGING_ACCESS_PASSWORD is set; never set it in production.
 */
export const STAGING_REALM = 'Saathi staging';

/** Paths that must work without the password: they carry their own secret or signature. */
export function isGateExempt(pathname: string): boolean {
  return pathname.startsWith('/api/cron/') || pathname.startsWith('/api/webhooks/') || pathname === '/api/health';
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the Authorization header carries Basic credentials with the right password (any username). */
export function hasStagingAccess(authorization: string | null, password: string): boolean {
  if (!authorization?.startsWith('Basic ')) return false;
  let decoded: string;
  try {
    decoded = atob(authorization.slice(6).trim());
  } catch {
    return false;
  }
  const colon = decoded.indexOf(':');
  if (colon < 0) return false;
  return safeEqual(decoded.slice(colon + 1), password);
}
