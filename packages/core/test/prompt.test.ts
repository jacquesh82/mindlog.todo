import { describe, expect, it } from 'vitest';
import {
  interpolatePrompt,
  isPromptKey,
  PROMPT_KEYS,
  PROMPT_PLACEHOLDERS,
  PROMPT_SEED,
} from '../src/domain/prompt.js';

describe('interpolatePrompt', () => {
  it('fills known {placeholders}', () => {
    expect(interpolatePrompt('Note:\n{note}\n--', { note: 'buy milk' })).toBe('Note:\nbuy milk\n--');
  });

  it('fills multiple placeholders, including empty values', () => {
    expect(interpolatePrompt('a{x}b{y}c', { x: '1', y: '' })).toBe('a1bc');
  });

  it('leaves unknown tokens untouched', () => {
    expect(interpolatePrompt('{known} {unknown}', { known: 'ok' })).toBe('ok {unknown}');
  });
});

describe('PROMPT_SEED', () => {
  it('defines a system + user template for every key', () => {
    for (const key of PROMPT_KEYS) {
      expect(PROMPT_SEED[key].system.length).toBeGreaterThan(0);
      expect(PROMPT_SEED[key].user.length).toBeGreaterThan(0);
    }
  });

  it('every declared placeholder appears in its user template', () => {
    for (const key of PROMPT_KEYS) {
      for (const ph of PROMPT_PLACEHOLDERS[key]) {
        expect(PROMPT_SEED[key].user).toContain(`{${ph}}`);
      }
    }
  });
});

describe('isPromptKey', () => {
  it('accepts known keys and rejects others', () => {
    expect(isPromptKey('ask')).toBe(true);
    expect(isPromptKey('summarize')).toBe(true);
    expect(isPromptKey('nope')).toBe(false);
  });
});
