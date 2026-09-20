import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_TTL_SECONDS = 12 * 3600;

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time password check against the ADMIN_PASSWORD env var. Refuses to match when it is unset or too short. */
export function checkAdminPassword(input: string, expected: string | undefined): boolean {
  if (!expected || expected.length < 10) return false;
  return timingSafeEqual(sha(input), sha(expected));
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createAdminToken(secret: string, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ admin: true, exp: now + SESSION_TTL_SECONDS * 1000 }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminToken(token: string | undefined, secret: string, now = Date.now()): boolean {
  if (!token) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      admin?: unknown;
      exp?: unknown;
    };
    return data.admin === true && typeof data.exp === 'number' && data.exp >= now;
  } catch {
    return false;
  }
}

export function getSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set (32+ chars) in production');
  return 'dev-only-insecure-session-secret-do-not-use';
}
