import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, passcodeHash } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { passcode } = await req.json().catch(() => ({}));
  const expected = process.env.APP_PASSCODE;
  if (!expected || passcode !== expected) {
    return NextResponse.json({ error: 'wrong passcode' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await passcodeHash(expected), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  });
  return res;
}
