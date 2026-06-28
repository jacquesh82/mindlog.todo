import type { ApiKey, User } from '../domain/user.js';
import { getPool } from '../db/pool.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  google_sub: string | null;
  mindlog_id_sub: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: Date;
}

function mapUser(r: UserRow): User {
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    googleSub: r.google_sub,
    mindlogIdSub: r.mindlog_id_sub,
    createdAt: r.created_at.toISOString(),
  };
}

/** Update a user's editable profile fields (display name, avatar). */
export async function updateProfile(
  userId: string,
  patch: { displayName?: string | null; avatarUrl?: string | null },
): Promise<User | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId];
  if (patch.displayName !== undefined) {
    sets.push(`display_name = $${vals.length + 1}`);
    vals.push(patch.displayName);
  }
  if (patch.avatarUrl !== undefined) {
    sets.push(`avatar_url = $${vals.length + 1}`);
    vals.push(patch.avatarUrl);
  }
  if (sets.length === 0) return findById(userId);
  const { rows } = await getPool().query<UserRow>(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    vals,
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

/** Full row including the password hash — for credential checks only. */
export async function findRowByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await getPool().query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string | null;
  displayName?: string | null;
  googleSub?: string | null;
}): Promise<User> {
  const { rows } = await getPool().query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name, google_sub)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [input.email, input.passwordHash, input.displayName ?? null, input.googleSub ?? null],
  );
  return mapUser(rows[0]!);
}

/** Find a user by Google subject, or by email, creating/linking as needed. */
export async function upsertGoogleUser(input: {
  googleSub: string;
  email: string;
  displayName?: string | null;
}): Promise<User> {
  const pool = getPool();
  const bySub = await pool.query<UserRow>('SELECT * FROM users WHERE google_sub = $1', [
    input.googleSub,
  ]);
  if (bySub.rows[0]) return mapUser(bySub.rows[0]);

  const byEmail = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [input.email]);
  if (byEmail.rows[0]) {
    const linked = await pool.query<UserRow>(
      'UPDATE users SET google_sub = $1 WHERE id = $2 RETURNING *',
      [input.googleSub, byEmail.rows[0].id],
    );
    return mapUser(linked.rows[0]!);
  }
  return createUser({
    email: input.email,
    passwordHash: null,
    displayName: input.displayName,
    googleSub: input.googleSub,
  });
}

/** Find a user by mindlog-id subject, or by email, creating/linking as needed. */
export async function upsertMindlogIdUser(input: {
  sub: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<User> {
  const pool = getPool();
  const bySub = await pool.query<UserRow>('SELECT * FROM users WHERE mindlog_id_sub = $1', [
    input.sub,
  ]);
  if (bySub.rows[0]) return mapUser(bySub.rows[0]);

  const byEmail = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [input.email]);
  if (byEmail.rows[0]) {
    // Link the mindlog id; backfill the avatar only when none is set locally.
    const linked = await pool.query<UserRow>(
      'UPDATE users SET mindlog_id_sub = $1, avatar_url = COALESCE(avatar_url, $2) WHERE id = $3 RETURNING *',
      [input.sub, input.avatarUrl ?? null, byEmail.rows[0].id],
    );
    return mapUser(linked.rows[0]!);
  }

  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (email, password_hash, display_name, avatar_url, mindlog_id_sub)
     VALUES ($1, NULL, $2, $3, $4) RETURNING *`,
    [input.email, input.displayName ?? null, input.avatarUrl ?? null, input.sub],
  );
  return mapUser(rows[0]!);
}

// --- mindlog id connection (OAuth tokens for agenda access) ---

export interface MindlogIdConnection {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

interface MindlogIdConnectionRow {
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  scope: string;
}

/** Insert or replace the user's mindlog id connection (latest sign-in wins). */
export async function upsertMindlogIdConnection(
  userId: string,
  c: MindlogIdConnection,
): Promise<void> {
  await getPool().query(
    `INSERT INTO mindlog_id_connections (user_id, access_token, refresh_token, expires_at, scope)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = EXCLUDED.refresh_token,
       expires_at = EXCLUDED.expires_at,
       scope = EXCLUDED.scope,
       updated_at = now()`,
    [userId, c.accessToken, c.refreshToken, c.expiresAt, c.scope],
  );
}

export async function getMindlogIdConnection(userId: string): Promise<MindlogIdConnection | null> {
  const { rows } = await getPool().query<MindlogIdConnectionRow>(
    'SELECT access_token, refresh_token, expires_at, scope FROM mindlog_id_connections WHERE user_id = $1',
    [userId],
  );
  const r = rows[0];
  return r
    ? { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: r.expires_at, scope: r.scope }
    : null;
}

export async function deleteMindlogIdConnection(userId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM mindlog_id_connections WHERE user_id = $1',
    [userId],
  );
  return (rowCount ?? 0) > 0;
}

// --- refresh tokens ---

export async function insertRefreshToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [input.userId, input.tokenHash, input.expiresAt],
  );
}

export async function findValidRefreshToken(
  tokenHash: string,
): Promise<{ id: string; userId: string } | null> {
  const { rows } = await getPool().query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? { id: rows[0].id, userId: rows[0].user_id } : null;
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await getPool().query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash],
  );
}

/** Revoke every active refresh token for a user (e.g. after a password reset). */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await getPool().query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}

// --- password reset tokens ---

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await getPool().query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
}

export async function createPasswordResetToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await getPool().query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)',
    [input.userId, input.tokenHash, input.expiresAt],
  );
}

export async function findValidPasswordResetToken(
  tokenHash: string,
): Promise<{ id: string; userId: string } | null> {
  const { rows } = await getPool().query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [tokenHash],
  );
  return rows[0] ? { id: rows[0].id, userId: rows[0].user_id } : null;
}

export async function consumePasswordResetToken(id: string): Promise<void> {
  await getPool().query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [id]);
}

// --- api keys ---

interface ApiKeyRow {
  id: string;
  name: string | null;
  prefix: string;
  created_at: Date;
  last_used_at: Date | null;
}

function mapApiKey(r: ApiKeyRow): ApiKey {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.created_at.toISOString(),
    lastUsedAt: r.last_used_at ? r.last_used_at.toISOString() : null,
  };
}

export async function createApiKey(input: {
  userId: string;
  name?: string | null;
  prefix: string;
  keyHash: string;
}): Promise<ApiKey> {
  const { rows } = await getPool().query<ApiKeyRow>(
    `INSERT INTO api_keys (user_id, name, prefix, key_hash)
     VALUES ($1,$2,$3,$4)
     RETURNING id, name, prefix, created_at, last_used_at`,
    [input.userId, input.name ?? null, input.prefix, input.keyHash],
  );
  return mapApiKey(rows[0]!);
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const { rows } = await getPool().query<ApiKeyRow>(
    `SELECT id, name, prefix, created_at, last_used_at FROM api_keys
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapApiKey);
}

export async function deleteApiKey(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM api_keys WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}

/** Resolve a presented API key hash to its owner, updating last_used_at. */
export async function resolveApiKeyHash(keyHash: string): Promise<{ userId: string } | null> {
  const { rows } = await getPool().query<{ user_id: string }>(
    `UPDATE api_keys SET last_used_at = now() WHERE key_hash = $1 RETURNING user_id`,
    [keyHash],
  );
  return rows[0] ? { userId: rows[0].user_id } : null;
}
