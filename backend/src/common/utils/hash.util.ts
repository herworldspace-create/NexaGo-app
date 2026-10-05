import { createHmac, timingSafeEqual } from 'crypto';

/**
 * HMAC-based hashing for values we only ever need to verify by comparison
 * (e.g. OTP codes) rather than decrypt. Uses a server-side secret ("pepper")
 * so hashes cannot be brute-forced offline even if the DB leaks, without
 * also leaking the secret.
 */
export function hmacHash(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
