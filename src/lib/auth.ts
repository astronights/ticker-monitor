export const AUTH_COOKIE = 'tm_session';

export async function passcodeHash(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(`ticker-monitor:${passcode}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
