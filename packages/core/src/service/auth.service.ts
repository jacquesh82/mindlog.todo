import { exchangeGoogleCode, getGoogleAuthUrl } from '../auth/google.js';
import {
  exchangeMindlogIdCode,
  getMindlogIdAuthUrl,
  setMindlogIdRecoveryEmail,
} from '../auth/mindlog-id.js';
import { signAccessToken, signMindlogIdPending, verifyMindlogIdPending } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateApiKey, generateRefreshToken, parseDurationMs, sha256 } from '../auth/tokens.js';
import { config } from '../config.js';
import type { ApiKey, AuthResult, LoginInput, RegisterInput, User } from '../domain/user.js';
import { BadRequest, Conflict, Unauthorized } from '../errors.js';
import { sendMail } from '../mail/mailer.js';
import { passwordResetEmail } from '../mail/templates/password-reset.js';
import * as projectRepo from '../repository/project.repo.js';
import * as userRepo from '../repository/user.repo.js';

/** Turn a duration like "1h" / "30m" / "2d" into a human label for emails. */
function humanTtl(ttl: string): string {
  const m = /^(\d+)\s*(m|h|d)?$/.exec(ttl.trim());
  if (!m) return ttl;
  const n = Number(m[1]);
  const unit = m[2] === 'd' ? 'day' : m[2] === 'm' ? 'minute' : 'hour';
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

async function issueTokens(user: User): Promise<AuthResult> {
  const accessToken = signAccessToken(user.id);
  const { token, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + parseDurationMs(config.jwtRefreshTtl));
  await userRepo.insertRefreshToken({ userId: user.id, tokenHash: hash, expiresAt });
  return {
    user,
    accessToken,
    refreshToken: token,
    expiresIn: Math.floor(parseDurationMs(config.jwtAccessTtl) / 1000),
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  if (await userRepo.findRowByEmail(input.email)) {
    throw Conflict('Email already registered');
  }
  const passwordHash = await hashPassword(input.password);
  const user = await userRepo.createUser({
    email: input.email,
    passwordHash,
    displayName: input.displayName ?? null,
  });
  await projectRepo.ensureInbox(user.id);
  return issueTokens(user);
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const row = await userRepo.findRowByEmail(input.email);
  if (!row?.password_hash || !(await verifyPassword(row.password_hash, input.password))) {
    throw Unauthorized('Invalid credentials');
  }
  return issueTokens({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    googleSub: row.google_sub,
    mindlogIdSub: row.mindlog_id_sub,
    createdAt: row.created_at.toISOString(),
  });
}

export async function refresh(refreshToken: string): Promise<AuthResult> {
  const hash = sha256(refreshToken);
  const found = await userRepo.findValidRefreshToken(hash);
  if (!found) throw Unauthorized('Invalid refresh token');
  await userRepo.revokeRefreshToken(hash); // rotation: single-use refresh tokens
  const user = await userRepo.findById(found.userId);
  if (!user) throw Unauthorized('User not found');
  return issueTokens(user);
}

export async function logout(refreshToken: string): Promise<void> {
  await userRepo.revokeRefreshToken(sha256(refreshToken));
}

// --- password reset ---

/**
 * Email a one-time reset link to the address, if it belongs to a local
 * (password) account. Always resolves silently so callers cannot probe which
 * emails are registered.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const row = await userRepo.findRowByEmail(email);
  if (!row?.password_hash) return; // unknown email, or Google/mindlog-id-only account
  const { token, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + parseDurationMs(config.passwordResetTtl));
  await userRepo.createPasswordResetToken({ userId: row.id, tokenHash: hash, expiresAt });
  const resetUrl = `${config.webUrl.replace(/\/$/, '')}/auth/reset?token=${token}`;
  const mail = passwordResetEmail({
    resetUrl,
    displayName: row.display_name,
    expiresIn: humanTtl(config.passwordResetTtl),
  });
  await sendMail({ to: row.email, subject: mail.subject, mjml: mail.mjml, text: mail.text });
}

/** Consume a reset token and set a new password, revoking existing sessions. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const found = await userRepo.findValidPasswordResetToken(sha256(token));
  if (!found) throw BadRequest('This reset link is invalid or has expired');
  const passwordHash = await hashPassword(newPassword);
  await userRepo.updatePasswordHash(found.userId, passwordHash);
  await userRepo.consumePasswordResetToken(found.id);
  await userRepo.revokeAllRefreshTokens(found.userId); // force re-login everywhere
}

// --- Google OAuth ---

export function googleAuthUrl(state: string): string {
  return getGoogleAuthUrl(state);
}

export async function loginWithGoogle(code: string): Promise<AuthResult> {
  const profile = await exchangeGoogleCode(code);
  const user = await userRepo.upsertGoogleUser({
    googleSub: profile.sub,
    email: profile.email,
    displayName: profile.name,
  });
  await projectRepo.ensureInbox(user.id);
  return issueTokens(user);
}

// --- mindlog id (central OIDC provider) ---

export function mindlogIdAuthUrl(state: string): Promise<string> {
  return getMindlogIdAuthUrl(state);
}

/**
 * Result of a "Sign in with mindlog id" callback. When the IdP returns no email
 * (handle-only account), we can't create the todo account yet — we hand back a
 * short-lived pending token so the UI can collect an email and finish via
 * {@link completeMindlogIdSignup}.
 */
export type MindlogIdLoginResult =
  | { status: 'ok'; result: AuthResult }
  | { status: 'need-email'; pendingToken: string };

export async function loginWithMindlogId(code: string): Promise<MindlogIdLoginResult> {
  const profile = await exchangeMindlogIdCode(code);
  if (!profile.email) {
    return {
      status: 'need-email',
      pendingToken: signMindlogIdPending(profile.sub, profile.name ?? null, profile.accessToken),
    };
  }
  const user = await userRepo.upsertMindlogIdUser({
    sub: profile.sub,
    email: profile.email,
    displayName: profile.name,
  });
  await projectRepo.ensureInbox(user.id);
  return { status: 'ok', result: await issueTokens(user) };
}

/** Finish a mindlog-id sign-in that lacked an email, using the address the user typed. */
export async function completeMindlogIdSignup(pendingToken: string, email: string): Promise<AuthResult> {
  const pending = verifyMindlogIdPending(pendingToken);
  if (!pending) throw Unauthorized('Invalid or expired mindlog id session — please sign in again');
  // Make mindlog id the single source of truth: store the email there too. The
  // IdP won't overwrite an existing one, and a failure must not block sign-in.
  if (pending.mlAccessToken) {
    try {
      await setMindlogIdRecoveryEmail(pending.mlAccessToken, email);
    } catch {
      /* best-effort — the todo account still gets the email below */
    }
  }
  const user = await userRepo.upsertMindlogIdUser({
    sub: pending.sub,
    email,
    displayName: pending.name,
  });
  await projectRepo.ensureInbox(user.id);
  return issueTokens(user);
}

// --- account & API keys ---

export function getUser(userId: string): Promise<User | null> {
  return userRepo.findById(userId);
}

export async function createApiKey(
  userId: string,
  name?: string,
): Promise<{ apiKey: ApiKey; secret: string }> {
  const { key, prefix, hash } = generateApiKey();
  const apiKey = await userRepo.createApiKey({ userId, name, prefix, keyHash: hash });
  return { apiKey, secret: key };
}

export function listApiKeys(userId: string): Promise<ApiKey[]> {
  return userRepo.listApiKeys(userId);
}

export function revokeApiKey(userId: string, id: string): Promise<boolean> {
  return userRepo.deleteApiKey(userId, id);
}

/** Resolve an API key (`mlt_…`) to its owner's user id, or null. */
export async function resolveApiKey(key: string): Promise<string | null> {
  if (!key.startsWith('mlt_')) return null;
  const found = await userRepo.resolveApiKeyHash(sha256(key));
  return found?.userId ?? null;
}
