import { createHmac, timingSafeEqual } from 'node:crypto';

/** Every signed token carries its expiry (seconds since the epoch). */
export interface Expiring {
  exp: number;
}

const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

/** `<base64url JSON>.<HMAC-SHA256>`: small, tamper-proof and readable only by the api. */
export function signToken<T extends Expiring>(payload: T, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data, secret)}`;
}

/** The payload, or null when the token is malformed, forged or expired. */
export function verifyToken<T extends Expiring>(
  token: string,
  secret: string,
  nowMs: number,
): T | null {
  const [data, signature, ...rest] = token.split('.');
  if (!data || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(data, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T;
    return typeof payload.exp === 'number' && payload.exp * 1000 > nowMs ? payload : null;
  } catch {
    return null;
  }
}
