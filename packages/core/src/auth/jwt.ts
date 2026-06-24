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
