import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminToken, getSessionSecret, SESSION_TTL_SECONDS, verifyAdminToken } from './auth.ts';

const COOKIE = 'bp_admin';

export async function setAdminSession(): Promise<void> {
  (await cookies()).set(COOKIE, createAdminToken(getSessionSecret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearAdminSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  return verifyAdminToken((await cookies()).get(COOKIE)?.value, getSessionSecret());
}

/** Call at the top of every admin page and every admin action: hiding the UI is not authorization. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect('/admin/login');
}

/** Best-effort client IP for rate limiting. Behind a proxy make sure it sets x-forwarded-for itself. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}
