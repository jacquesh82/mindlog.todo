import type { AiLog, AiLogKind, AiUsage } from '../domain/ai-log.js';
import { getPool } from '../db/pool.js';

const COLS = `id, user_id, kind, model, prompt, response,
  input_tokens, output_tokens, created_at`;

interface Row {
  id: string;
  user_id: string;
  kind: AiLogKind;
  model: string | null;
  prompt: string;
  response: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: Date;
}

function mapRow(r: Row): AiLog {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    model: r.model,
    prompt: r.prompt,
    response: r.response,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    createdAt: r.created_at.toISOString(),
  };
}

export interface InsertAiLog {
  kind: AiLogKind;
  model?: string | null;
  prompt: string;
  response?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}

export async function insert(userId: string, log: InsertAiLog): Promise<AiLog> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO ai_logs (user_id, kind, model, prompt, response, input_tokens, output_tokens)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${COLS}`,
    [
      userId,
      log.kind,
      log.model ?? null,
      log.prompt,
      log.response ?? null,
      log.inputTokens ?? 0,
      log.outputTokens ?? 0,
    ],
  );
  return mapRow(rows[0]!);
}

export async function list(userId: string, limit = 50): Promise<AiLog[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM ai_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map(mapRow);
}

export async function usage(userId: string): Promise<AiUsage> {
  const { rows } = await getPool().query<{
    calls: string;
    input_tokens: string | null;
    output_tokens: string | null;
  }>(
    `SELECT count(*) AS calls,
            COALESCE(sum(input_tokens), 0) AS input_tokens,
            COALESCE(sum(output_tokens), 0) AS output_tokens
       FROM ai_logs WHERE user_id = $1`,
    [userId],
  );
  const r = rows[0]!;
  const inputTokens = Number(r.input_tokens ?? 0);
  const outputTokens = Number(r.output_tokens ?? 0);
  return {
    calls: Number(r.calls),
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}
