import { NextResponse, type NextRequest } from 'next/server';
import { hasStagingAccess, isGateExempt, STAGING_REALM } from './platform/staging-gate';

/** Next.js 16 request proxy (formerly middleware). Only used for the staging password gate. */
export function proxy(req: NextRequest) {
  const password = process.env.STAGING_ACCESS_PASSWORD;
  if (!password || isGateExempt(req.nextUrl.pathname)) return NextResponse.next();
  if (hasStagingAccess(req.headers.get('authorization'), password)) return NextResponse.next();
  return new NextResponse('Saathi staging site. Ask the Saathi team for the password.', {
    status: 401,
    headers: { 'WWW-Authenticate': `Basic realm="${STAGING_REALM}", charset="UTF-8"`, 'Cache-Control': 'no-store' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
