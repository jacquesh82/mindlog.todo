import { randomUUID } from 'node:crypto';
import {
  authService,
  config,
  forgotPasswordSchema,
  googleEnabled,
  loginSchema,
  mindlogIdEnabled,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  ServiceUnavailable,
  type AuthResult,
} from '@mindlog/core';
import { Router } from 'express';

export const authRouter: Router = Router();

function authBody(result: AuthResult) {
  return {
    user: result.user,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  };
}

authRouter.post('/register', async (req, res) => {
  const result = await authService.register(registerSchema.parse(req.body));
  res.status(201).json(authBody(result));
});

authRouter.post('/login', async (req, res) => {
  const result = await authService.login(loginSchema.parse(req.body));
  res.json(authBody(result));
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  res.json(authBody(await authService.refresh(refreshToken)));
});

authRouter.post('/logout', async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  await authService.logout(refreshToken);
  res.status(204).end();
});

// --- password reset ---

authRouter.post('/forgot-password', async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  await authService.requestPasswordReset(email);
  res.status(202).json({ ok: true }); // always 202: never reveals whether the email exists
});

authRouter.post('/reset-password', async (req, res) => {
  const { token, password } = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(token, password);
  res.status(204).end();
});

// --- Google OAuth (redirect flow) ---

authRouter.get('/google', (_req, res) => {
  if (!googleEnabled()) throw ServiceUnavailable('Google OAuth is not configured');
  // Note: in V0 the `state` is generated but not persisted/verified server-side.
  const url = authService.googleAuthUrl(randomUUID());
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const result = await authService.loginWithGoogle(code);
  const fragment = new URLSearchParams({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: String(result.expiresIn),
  }).toString();
  res.redirect(`${config.webUrl}/auth/callback#${fragment}`);
});

// --- mindlog id (central OIDC provider, redirect flow) ---

authRouter.get('/mindlog-id', async (_req, res) => {
  if (!mindlogIdEnabled()) throw ServiceUnavailable('mindlog id is not configured');
  const url = await authService.mindlogIdAuthUrl(randomUUID());
  res.redirect(url);
});

authRouter.get('/mindlog-id/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const result = await authService.loginWithMindlogId(code);
  const fragment = new URLSearchParams({
    access_token: result.accessToken,
    refresh_token: result.refreshToken,
    expires_in: String(result.expiresIn),
  }).toString();
  res.redirect(`${config.webUrl}/auth/callback#${fragment}`);
});
