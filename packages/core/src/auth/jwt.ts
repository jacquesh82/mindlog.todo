import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    expiresIn: config.jwtAccessTtl as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { sub?: string };
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

// Short-lived token carrying a mindlog-id identity (sub + name) between the OAuth
// callback and the "enter your email" step, when the IdP returned no email.
const MINDLOG_ID_PENDING_TTL: jwt.SignOptions['expiresIn'] = '15m';

export function signMindlogIdPending(sub: string, name: string | null, mlAccessToken: string): string {
  return jwt.sign(
    { sub, name: name ?? undefined, mlat: mlAccessToken, purpose: 'mindlog-id-pending' },
    config.jwtSecret,
    { expiresIn: MINDLOG_ID_PENDING_TTL },
  );
}

export function verifyMindlogIdPending(
  token: string,
): { sub: string; name: string | null; mlAccessToken: string } | null {
  try {
    const d = jwt.verify(token, config.jwtSecret) as {
      sub?: string;
      name?: string;
      mlat?: string;
      purpose?: string;
    };
    if (d.purpose !== 'mindlog-id-pending' || !d.sub) return null;
    return { sub: d.sub, name: d.name ?? null, mlAccessToken: d.mlat ?? '' };
  } catch {
    return null;
  }
}
