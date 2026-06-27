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
// callback and the "enter your email" step, when the IdP returned no email. It
// also carries the OAuth tokens + granted scope so the agenda connection can be
// stored once the account is finally created.
const MINDLOG_ID_PENDING_TTL: jwt.SignOptions['expiresIn'] = '15m';

export interface MindlogIdPending {
  sub: string;
  name: string | null;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
}

export function signMindlogIdPending(p: MindlogIdPending): string {
  return jwt.sign(
    {
      sub: p.sub,
      name: p.name ?? undefined,
      mlat: p.accessToken,
      mlrt: p.refreshToken,
      mlexp: p.expiresIn,
      mlsc: p.scope,
      purpose: 'mindlog-id-pending',
    },
    config.jwtSecret,
    { expiresIn: MINDLOG_ID_PENDING_TTL },
  );
}

export function verifyMindlogIdPending(token: string): MindlogIdPending | null {
  try {
    const d = jwt.verify(token, config.jwtSecret) as {
      sub?: string;
      name?: string;
      mlat?: string;
      mlrt?: string;
      mlexp?: number;
      mlsc?: string;
      purpose?: string;
    };
    if (d.purpose !== 'mindlog-id-pending' || !d.sub) return null;
    return {
      sub: d.sub,
      name: d.name ?? null,
      accessToken: d.mlat ?? '',
      refreshToken: d.mlrt ?? '',
      expiresIn: d.mlexp ?? 3600,
      scope: d.mlsc ?? '',
    };
  } catch {
    return null;
  }
}
