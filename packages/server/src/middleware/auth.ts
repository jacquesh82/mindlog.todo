import { authService, Unauthorized, verifyAccessToken } from '@mindlog/core';
import type { NextFunction, Request, Response } from 'express';

/** Extract a `Bearer` token and resolve it to a user id (JWT or `mlt_` API key). */
export async function resolveUserId(authorization: string | undefined): Promise<string | null> {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  if (token.startsWith('mlt_')) {
    return authService.resolveApiKey(token);
  }
  return verifyAccessToken(token);
}

/** Populate req.userId if a valid credential is present (does not reject). */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = await resolveUserId(req.header('authorization'));
  if (userId) req.userId = userId;
  next();
}

/** Reject with 401 unless a user was authenticated. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.userId) {
    next(Unauthorized('Authentication required'));
    return;
  }
  next();
}

/** Narrow helper: the authenticated user id (throws if missing). */
export function userId(req: Request): string {
  if (!req.userId) throw Unauthorized('Authentication required');
  return req.userId;
}
