import { notePageText, type NotePage } from '../domain/note.js';
import { interpolatePrompt } from '../domain/prompt.js';
import { BadRequest } from '../errors.js';
import { chatComplete } from '../llm/chat.js';
import * as aiLog from '../service/ai-log.service.js';
import { resolveAiConfig } from '../service/ai.service.js';
import * as noteService from '../service/note.service.js';
import { resolvePrompt } from '../service/prompt.service.js';

const PER_PAGE_CHARS = 2000;
const TOTAL_CHARS = 16000;
const rid = () => Math.random().toString(36).slice(2, 10);

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wrap plain text into the NotesEditor box-JSON content shape. */
function toBoxContent(text: string): string {
  const html = escapeHtml(text).replace(/\n/g, '<br>');
  return JSON.stringify({ boxes: [{ id: rid(), x: 16, y: 16, w: 640, html }] });
}

/**
 * Summarize every page in a notebook into a brand-new "Summary" page added to
 * that same notebook (existing pages are never modified). Mirrors {@link askTasks}.
 */
export async function summarizeNotebook(userId: string, notebookId: string): Promise<NotePage> {
  const summaries = await noteService.listPages(userId, notebookId);
  const sources = summaries.filter((p) => !p.title.startsWith('Summary'));
  if (sources.length === 0) throw BadRequest('Notebook has no pages to summarize');

  const pages = (
    await Promise.all(sources.map((p) => noteService.getPage(userId, p.id).catch(() => null)))
  ).filter((p): p is NotePage => p !== null);

  let context = '';
  for (const p of pages) {
    const body = notePageText(p.title, p.content).slice(0, PER_PAGE_CHARS);
    const block = `## ${p.title || 'Untitled'}\n${body}\n\n`;
    if (context.length + block.length > TOTAL_CHARS) break;
    context += block;
  }

  const ai = await resolveAiConfig(userId);
  if (ai.cloud) await aiLog.assertWithinLimit(userId);

  const tpl = await resolvePrompt(userId, 'summarize');
  const prompt = interpolatePrompt(tpl.user, { pages: context });
  const result = await chatComplete({
    provider: ai.provider,
    model: ai.model,
    apiKey: ai.apiKey,
    system: tpl.system,
    prompt,
    maxTokens: 1024,
  });

  await aiLog.record(userId, {
    kind: 'summarize',
    model: ai.model,
    prompt,
    response: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  const date = new Date().toISOString().slice(0, 10);
  const body = result.text.trim() || 'No content to summarize.';
  return noteService.createPage(userId, notebookId, {
    title: `Summary — ${date}`,
    content: toBoxContent(body),
  });
}
