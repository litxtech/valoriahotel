import { hmacSha256Base64, timingSafeEqual } from '../utils/hmac.js';

export function verifyGatewaySignature(args: {
  secret: string;
  ts: number;
  method: string;
  path: string;
  body: string;
  signature: string;
  maxSkewMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const maxSkewMs = args.maxSkewMs ?? 5 * 60_000;
  const now = Date.now();
  if (Math.abs(now - args.ts) > maxSkewMs) return { ok: false, reason: 'Timestamp skew too large' };

  const message = `${args.ts}.${args.method.toUpperCase()}.${args.path}.${args.body}`;
  const expected = hmacSha256Base64(args.secret, message);
  if (!timingSafeEqual(expected, args.signature)) return { ok: false, reason: 'Invalid signature' };
  return { ok: true };
}

