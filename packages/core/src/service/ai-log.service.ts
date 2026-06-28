import { config } from '../config.js';
import type { AiCredits, AiLog, AiUsage } from '../domain/ai-log.js';
import { PaymentRequired } from '../errors.js';
import * as repo from '../repository/ai-log.repo.js';

export type RecordAiLog = repo.InsertAiLog;

/**
 * Record a generative AI call. Never throws into the caller's happy path — a
 * logging failure must not break the feature it instruments.
 */
export async function record(userId: string, log: RecordAiLog): Promise<void> {
  try {
    await repo.insert(userId, log);
  } catch (err) {
    console.error('[ai-log] failed to record:', err);
  }
}

export function listLogs(userId: string, limit = 50): Promise<AiLog[]> {
  return repo.list(userId, limit);
}

export function getUsage(userId: string): Promise<AiUsage> {
  return repo.usage(userId);
}

/** Start of the current month (UTC) — the credit accounting window. */
function monthStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Per-user credit balance for the current month (cloud-hosted mode). */
export async function getCredits(userId: string): Promise<AiCredits> {
  const start = monthStart();
  const usedTokens = await repo.tokensSince(userId, start);
  const resetAt = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { usedTokens, limitTokens: config.aiMonthlyTokenLimit, resetAt: resetAt.toISOString() };
}

/** Throw 402 when the user has exhausted their monthly token allowance. */
export async function assertWithinLimit(userId: string): Promise<void> {
  const { usedTokens, limitTokens } = await getCredits(userId);
  if (usedTokens >= limitTokens) {
    throw PaymentRequired('Monthly AI credit limit reached');
  }
}
