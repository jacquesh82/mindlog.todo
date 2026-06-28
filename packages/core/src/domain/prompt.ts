import { z } from 'zod';

// Central registry of the LLM prompts the app uses. Each has a SYSTEM part and a
// USER template (with {placeholders}). PROMPT_SEED holds the built-in defaults —
// it is the "seed file": resetting a prompt re-injects the value from here.

export const PROMPT_KEYS = ['ask', 'extract_tasks', 'summarize'] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

export interface PromptTemplate {
  /** The system prompt (role / behaviour). */
  system: string;
  /** The user message template, with {placeholder} tokens filled at call time. */
  user: string;
}

/** Placeholders available in each prompt's USER template (for the editor's hints). */
export const PROMPT_PLACEHOLDERS: Record<PromptKey, string[]> = {
  ask: ['tasks', 'notes', 'question'],
  extract_tasks: ['note'],
  summarize: ['pages'],
};

/** Built-in default prompts — the seed used to (re)initialise / reset. */
export const PROMPT_SEED: Record<PromptKey, PromptTemplate> = {
  ask: {
    system:
      'You are a task-management assistant. Answer the user question using ONLY the ' +
      'provided tasks and notes. Cite tasks by their [n] index and notes by their [Nn] ' +
      'index. Be concise. If the context does not contain enough information to answer, ' +
      'say so plainly.',
    user: 'Tasks:\n{tasks}{notes}\n\nQuestion: {question}',
  },
  extract_tasks: {
    system:
      'You extract actionable to-do items from a note. Return ONE task per line and ' +
      'nothing else — no headings, no numbering, no commentary, no blank lines. Each ' +
      'line must be a short imperative task. You MAY use Todoist quick-add syntax when ' +
      'the note implies it: #Project, @label, p1–p4 for priority, and natural-language ' +
      'dates (e.g. "tomorrow", "Friday"). If the note contains no actionable items, ' +
      'return nothing at all.',
    user: 'Note:\n{note}\n\nList the tasks:',
  },
  summarize: {
    system:
      'You summarize a notebook into a single concise, well-structured digest. Use short ' +
      'section headings (one per source page where useful) followed by bullet points of the ' +
      'key facts, decisions and to-dos. Be faithful to the source; do not invent. Plain text ' +
      'only — no markdown symbols beyond "- " bullets.',
    user: 'Pages:\n\n{pages}\nWrite the notebook summary:',
  },
};

export function isPromptKey(v: string): v is PromptKey {
  return (PROMPT_KEYS as readonly string[]).includes(v);
}

/** Fill {placeholder} tokens in a template; unknown tokens are left untouched. */
export function interpolatePrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name]! : whole,
  );
}

export const promptSaveSchema = z.object({
  system: z.string().max(20_000),
  user: z.string().max(20_000),
});
export type PromptSaveInput = z.infer<typeof promptSaveSchema>;

/** A prompt as shown in Settings: effective value + whether it overrides the seed. */
export interface PromptView extends PromptTemplate {
  key: PromptKey;
  isCustom: boolean;
  placeholders: string[];
}
