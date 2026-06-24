import { createHash, randomBytes } from 'node:crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Opaque refresh token + its stored hash. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

/** API key (`mlt_…`), the display prefix, and the stored hash. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString('base64url');
  const key = `mlt_${secret}`;
  return { key, prefix: key.slice(0, 12), hash: sha256(key) };
}

/** Parse a duration like "30d", "15m", "24h", "3600s", or plain seconds → ms. */
export function parseDurationMs(value: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!m) throw new Error(`Invalid duration: ${value}`);
  const n = Number(m[1]);
  switch (m[2]) {
    case 'ms':
      return n;
    case 's':
      return n * 1000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    case 'd':
      return n * 86_400_000;
    default:
      return n * 1000; // bare number = seconds
  }
}
