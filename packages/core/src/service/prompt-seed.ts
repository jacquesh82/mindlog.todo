import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';
import { PROMPT_KEYS, PROMPT_SEED, type PromptKey, type PromptTemplate } from '../domain/prompt.js';

// The seed file is a JSON map { <key>: { system, user } } on disk. It is read at
// startup as the default prompts, and is the target/source of the "sync to/from
// seed file" buttons. Missing/invalid entries fall back to the built-in seed.

const FILE = config.promptsSeedFile;

function isTemplate(v: unknown): v is PromptTemplate {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as PromptTemplate).system === 'string' &&
    typeof (v as PromptTemplate).user === 'string'
  );
}

export function seedFilePath(): string {
  return FILE;
}

/** Effective seed prompts: the seed file's values, falling back to the built-ins. */
export function readSeedPrompts(): Record<PromptKey, PromptTemplate> {
  let data: Record<string, unknown> = {};
  try {
    if (existsSync(FILE)) data = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>;
  } catch (err) {
    console.error('[prompt-seed] failed to read seed file, using built-in seed:', err);
  }
  const out = {} as Record<PromptKey, PromptTemplate>;
  for (const key of PROMPT_KEYS) {
    const v = data[key];
    out[key] = isTemplate(v) ? { system: v.system, user: v.user } : PROMPT_SEED[key];
  }
  return out;
}

/** Overwrite the seed file with a full set of prompts (creating parent dirs). */
export function writeSeedPrompts(prompts: Record<PromptKey, PromptTemplate>): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, `${JSON.stringify(prompts, null, 2)}\n`, 'utf8');
}

/** Create the seed file from the built-in seed if it does not exist yet. */
export function ensureSeedFile(): void {
  try {
    if (!existsSync(FILE)) writeSeedPrompts(PROMPT_SEED);
  } catch (err) {
    console.error('[prompt-seed] could not create seed file:', err);
  }
}
