import { NotFound } from '../errors.js';
import {
  PROMPT_KEYS,
  PROMPT_PLACEHOLDERS,
  type PromptKey,
  type PromptSaveInput,
  type PromptTemplate,
  type PromptView,
} from '../domain/prompt.js';
import * as repo from '../repository/prompt.repo.js';
import { readSeedPrompts, writeSeedPrompts } from './prompt-seed.js';

/**
 * The effective prompt for a key: the user's saved override if any, else the
 * seed (read from the seed file). This is what the RAG features call at request time.
 */
export async function resolvePrompt(userId: string, key: PromptKey): Promise<PromptTemplate> {
  const override = await repo.get(userId, key);
  return override ?? readSeedPrompts()[key];
}

/** All prompts for the Settings editor: effective value + whether it's customised. */
export async function listPrompts(userId: string): Promise<PromptView[]> {
  const seed = readSeedPrompts();
  const overrides = await repo.getAll(userId);
  return PROMPT_KEYS.map((key) => {
    const tpl = overrides.get(key) ?? seed[key];
    return {
      key,
      system: tpl.system,
      user: tpl.user,
      isCustom: overrides.has(key),
      placeholders: PROMPT_PLACEHOLDERS[key],
    };
  });
}

/** Write the user's current effective prompts to the seed file (sync → file). */
export async function exportSeed(userId: string): Promise<PromptView[]> {
  const views = await listPrompts(userId);
  const record = {} as Record<PromptKey, PromptTemplate>;
  for (const v of views) record[v.key] = { system: v.system, user: v.user };
  writeSeedPrompts(record);
  return views;
}

/** Re-inject the seed file: drop overrides so every prompt resolves from the file. */
export async function importSeed(userId: string): Promise<PromptView[]> {
  await repo.removeAll(userId);
  return listPrompts(userId);
}

export async function savePrompt(userId: string, key: PromptKey, input: PromptSaveInput): Promise<PromptView> {
  await repo.upsert(userId, key, { system: input.system, user: input.user });
  return single(await listPrompts(userId), key);
}

/** Reset one prompt to its seed value (drop the override). */
export async function resetPrompt(userId: string, key: PromptKey): Promise<PromptView> {
  await repo.remove(userId, key);
  return single(await listPrompts(userId), key);
}

/** Reset every prompt to its seed value (re-inject the seed file). */
export async function resetAllPrompts(userId: string): Promise<PromptView[]> {
  await repo.removeAll(userId);
  return listPrompts(userId);
}

function single(views: PromptView[], key: PromptKey): PromptView {
  const v = views.find((p) => p.key === key);
  if (!v) throw NotFound('Prompt not found');
  return v;
}
