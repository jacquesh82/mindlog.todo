import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { notePageText } from '../domain/note.js';
import type { TaskAskInput, TaskAskResult } from '../domain/task.js';
import { ServiceUnavailable } from '../errors.js';
import * as aiLog from '../service/ai-log.service.js';
import * as noteService from '../service/note.service.js';
import { searchTasks } from '../service/task.service.js';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!config.anthropicApiKey) {
    throw ServiceUnavailable('ANTHROPIC_API_KEY is not configured');
  }
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

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

  // Pull RAG-enabled note pages too.
  const pageHits = await noteService.searchPages(userId, input.question, input.k).catch(() => []);
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
  const message = await getClient().messages.create({
    model: config.askModel,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const answer = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  // Record the call (prompt, response, token usage) for the activity log.
  await aiLog.record(userId, {
    kind: 'ask',
    model: config.askModel,
    prompt: userPrompt,
    response: answer,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  return {
    answer,
    sources: hits.map(({ score: _score, ...task }) => task),
    noteSources: pages.map((p) => ({ id: p.id, title: p.title, notebookId: p.notebookId })),
  };
}
