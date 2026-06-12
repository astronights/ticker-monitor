import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, passcodeHash } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth', '/api/cron'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const passcode = process.env.APP_PASSCODE;
  if (!passcode) return NextResponse.next(); // not configured yet — don't lock out setup

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await passcodeHash(passcode))) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/|sw\\.js|manifest\\.webmanifest|icons/|favicon\\.ico).*)'],
};
