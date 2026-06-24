import type { AiLog, AiUsage } from '../domain/ai-log.js';
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
