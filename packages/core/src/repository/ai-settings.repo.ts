import { getPool } from '../db/pool.js';

export interface AiSettings {
  provider: string;
  model: string;
  /** Encrypted API key, or null when none stored. */
  apiKeyEnc: string | null;
}

interface Row {
  provider: string;
  model: string;
  api_key_enc: string | null;
}

export async function get(userId: string): Promise<AiSettings | null> {
  const { rows } = await getPool().query<Row>(
    'SELECT provider, model, api_key_enc FROM user_ai_settings WHERE user_id = $1',
    [userId],
  );
  const r = rows[0];
  return r ? { provider: r.provider, model: r.model, apiKeyEnc: r.api_key_enc } : null;
}

/**
 * Upsert a user's AI settings. `apiKeyEnc` semantics: `undefined` leaves the
 * stored key untouched, a string replaces it, `null` clears it.
 */
export async function upsert(
  userId: string,
  input: { provider: string; model: string; apiKeyEnc?: string | null },
): Promise<void> {
  const touchKey = input.apiKeyEnc !== undefined;
  await getPool().query(
    `INSERT INTO user_ai_settings (user_id, provider, model, api_key_enc)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       ${touchKey ? 'api_key_enc = EXCLUDED.api_key_enc,' : ''}
       updated_at = now()`,
    [userId, input.provider, input.model, input.apiKeyEnc ?? null],
  );
}

export async function clearKey(userId: string): Promise<void> {
  await getPool().query(
    'UPDATE user_ai_settings SET api_key_enc = NULL, updated_at = now() WHERE user_id = $1',
    [userId],
  );
}
