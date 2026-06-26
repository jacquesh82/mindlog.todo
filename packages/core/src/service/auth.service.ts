import { exchangeGoogleCode, getGoogleAuthUrl } from '../auth/google.js';
import { signAccessToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { generateApiKey, generateRefreshToken, parseDurationMs, sha256 } from '../auth/tokens.js';
import { config } from '../config.js';
import type { ApiKey, AuthResult, LoginInput, RegisterInput, User } from '../domain/user.js';
import { Conflict, Unauthorized } from '../errors.js';
import * as projectRepo from '../repository/project.repo.js';
import * as userRepo from '../repository/user.repo.js';

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
