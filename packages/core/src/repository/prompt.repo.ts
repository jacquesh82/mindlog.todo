import { getPool } from '../db/pool.js';
import type { PromptKey, PromptTemplate } from '../domain/prompt.js';

interface Row {
  key: string;
  system: string;
  user_template: string;
}

/** All of a user's prompt overrides, keyed by prompt key. */
export async function getAll(userId: string): Promise<Map<PromptKey, PromptTemplate>> {
  const { rows } = await getPool().query<Row>(
    'SELECT key, system, user_template FROM ai_prompts WHERE user_id = $1',
    [userId],
  );
  const map = new Map<PromptKey, PromptTemplate>();
  for (const r of rows) map.set(r.key as PromptKey, { system: r.system, user: r.user_template });
  return map;
}

export async function get(userId: string, key: PromptKey): Promise<PromptTemplate | null> {
  const { rows } = await getPool().query<Row>(
    'SELECT key, system, user_template FROM ai_prompts WHERE user_id = $1 AND key = $2',
    [userId, key],
  );
  const r = rows[0];
  return r ? { system: r.system, user: r.user_template } : null;
}

export async function upsert(userId: string, key: PromptKey, tpl: PromptTemplate): Promise<void> {
  await getPool().query(
    `INSERT INTO ai_prompts (user_id, key, system, user_template)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, key) DO UPDATE SET
       system = EXCLUDED.system,
       user_template = EXCLUDED.user_template,
       updated_at = now()`,
    [userId, key, tpl.system, tpl.user],
  );
}

export async function remove(userId: string, key: PromptKey): Promise<void> {
  await getPool().query('DELETE FROM ai_prompts WHERE user_id = $1 AND key = $2', [userId, key]);
}

export async function removeAll(userId: string): Promise<void> {
  await getPool().query('DELETE FROM ai_prompts WHERE user_id = $1', [userId]);
}
