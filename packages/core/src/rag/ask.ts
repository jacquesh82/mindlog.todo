import { notePageText } from '../domain/note.js';
import type { TaskAskInput, TaskAskResult } from '../domain/task.js';
import { chatComplete } from '../llm/chat.js';
import * as aiLog from '../service/ai-log.service.js';
import { resolveAiConfig } from '../service/ai.service.js';
import * as noteService from '../service/note.service.js';
import { searchTasks } from '../service/task.service.js';

const SYSTEM_PROMPT =
  'You are a task-management assistant. Answer the user question using ONLY the ' +
  'provided tasks and notes. Cite tasks by their [n] index and notes by their [Nn] ' +
  'index. Be concise. If the context does not contain enough information to answer, ' +
  'say so plainly.';

/** Retrieve the most relevant tasks and notes and have Claude answer (RAG). */
export async function askTasks(userId: string, input: TaskAskInput): Promise<TaskAskResult> {
  const hits = await searchTasks(userId, { query: input.question, k: input.k });

  const context =
    hits
      .map(
        (t, i) =>
          `[${i + 1}] (id=${t.id}) ${t.title}\n` +
          `    status=${t.status} progress=${t.progress}% ` +
          `assignee=${t.assignee ?? '-'} due=${t.dueDate ?? '-'}\n` +
          (t.description ? `    ${t.description}` : ''),
      )
      .join('\n\n') || '(no matching tasks)';

  // Pull RAG-enabled note pages too (optionally scoped to chosen notebooks).
  const pageHits = await noteService
    .searchPages(userId, input.question, input.k, { notebookIds: input.notebookIds })
    .catch(() => []);
  const pages = (
    await Promise.all(pageHits.map((p) => noteService.getPage(userId, p.id).catch(() => null)))
  ).filter((p): p is NonNullable<typeof p> => p !== null);
  const noteContext = pages
    .map((p, i) => `[N${i + 1}] ${p.title}\n    ${notePageText('', p.content).slice(0, 1000)}`)
    .join('\n\n');

  const userPrompt =
    `Tasks:\n${context}` +
    (noteContext ? `\n\nNotes:\n${noteContext}` : '') +
    `\n\nQuestion: ${input.question}`;

  // Resolve the effective model/key: shared (cloud) or the user's own (BYOK).
  const ai = await resolveAiConfig(userId);
  // Cloud-hosted: meter the monthly token budget before spending it.
  if (ai.cloud) await aiLog.assertWithinLimit(userId);

  const result = await chatComplete({
    model: ai.model,
    apiKey: ai.apiKey,
    system: SYSTEM_PROMPT,
    prompt: userPrompt,
    maxTokens: 1024,
  });
  const answer = result.text;

  // Record the call (prompt, response, token usage) for the activity log.
  await aiLog.record(userId, {
    kind: 'ask',
    model: ai.model,
    prompt: userPrompt,
    response: answer,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  return {
    answer,
    sources: hits.map(({ score: _score, ...task }) => task),
    noteSources: pages.map((p) => ({ id: p.id, title: p.title, notebookId: p.notebookId })),
  };
}
