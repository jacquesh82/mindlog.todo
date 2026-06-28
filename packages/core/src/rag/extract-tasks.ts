import { notePageText } from '../domain/note.js';
import { interpolatePrompt } from '../domain/prompt.js';
import { chatComplete } from '../llm/chat.js';
import * as aiLog from '../service/ai-log.service.js';
import { resolveAiConfig } from '../service/ai.service.js';
import * as noteService from '../service/note.service.js';
import { resolvePrompt } from '../service/prompt.service.js';

/** Strip a leading bullet / number / checkbox marker from a suggested line. */
function cleanLine(raw: string): string {
  return raw
    .replace(/^[\s]*[-*•·☐☑]\s*/, '')
    .replace(/^[\s]*\d+[.)]\s*/, '')
    .replace(/^[\s]*\[[ xX]?\]\s*/, '')
    .trim();
}

/**
 * Turn the model's free-text reply into a clean, de-duplicated task list:
 * one task per line, leading bullets/numbers/checkboxes stripped, blanks
 * removed, case-insensitively de-duplicated, and capped at 50.
 */
export function parseTaskLines(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split('\n')
    .map(cleanLine)
    .filter((l) => l.length > 0)
    .filter((l) => {
      const key = l.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

export interface ExtractTasksResult {
  tasks: string[];
}

/**
 * Read a note page and have the LLM propose a list of tasks (preview only — the
 * caller decides which to actually create). Mirrors {@link askTasks}.
 */
export async function extractTasksFromPage(userId: string, pageId: string): Promise<ExtractTasksResult> {
  const page = await noteService.getPage(userId, pageId);
  const text = notePageText(page.title, page.content).slice(0, 8000);
  if (!text.trim()) return { tasks: [] };

  const ai = await resolveAiConfig(userId);
  if (ai.cloud) await aiLog.assertWithinLimit(userId);

  const tpl = await resolvePrompt(userId, 'extract_tasks');
  const prompt = interpolatePrompt(tpl.user, { note: text });
  const result = await chatComplete({
    provider: ai.provider,
    model: ai.model,
    apiKey: ai.apiKey,
    system: tpl.system,
    prompt,
    maxTokens: 512,
  });

  await aiLog.record(userId, {
    kind: 'extract_tasks',
    model: ai.model,
    prompt,
    response: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return { tasks: parseTaskLines(result.text) };
}
