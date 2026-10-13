import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
  randomUUID,
} from 'node:crypto';
import { FlightPilotError } from '@flightpilot/shared';
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function encrypt(value: unknown, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${body.toString('hex')}`;
}
export function decrypt<T>(value: string, key: string): T {
  const [iv, tag, body] = value.split('.');
  if (!iv || !tag || !body) throw new Error('Invalid encrypted record');
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  cipher.setAuthTag(Buffer.from(tag, 'hex'));
  return JSON.parse(
    Buffer.concat([cipher.update(Buffer.from(body, 'hex')), cipher.final()]).toString('utf8'),
  ) as T;
}
export function sessionCookie(secret: string) {
  const value = Buffer.from(
    JSON.stringify({ userId: 'local-user', expires: Date.now() + 8 * 60 * 60 * 1000, nonce: randomUUID() }),
  ).toString('base64url');
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}
export function authenticateSession(value: string, secret: string) {
  const [payload, signature] = value.split('.');
  if (
    !payload ||
    !signature ||
    !equalSecret(signature, createHmac('sha256', secret).update(payload).digest('base64url'))
  )
    throw new FlightPilotError('UNAUTHENTICATED', 'Sign in through the checkout site.');
  try {
    const v = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; expires: number };
    if (v.userId !== 'local-user' || v.expires < Date.now()) throw new Error();
    return v.userId;
  } catch {
    throw new FlightPilotError('UNAUTHENTICATED', 'Your session expired. Sign in again.');
  }
}
// Allowlisted fields only; upstream bodies, request headers and traveller objects are never logged.
export function logEvent(
  event: string,
  fields: { requestId?: string; code?: string; durationMs?: number } = {},
) {
  console.error(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}
const buckets = new Map<string, { count: number; expires: number }>();
export function rateLimit(key: string, limit = 60, windowMs = 60000) {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.expires < now) buckets.delete(k);
  const bucket = buckets.get(key) ?? { count: 0, expires: now + windowMs };
  bucket.count++;
  buckets.set(key, bucket);
  if (bucket.count > limit)
    throw new FlightPilotError('RATE_LIMITED', 'Too many requests. Wait a minute before retrying.', true);
}
