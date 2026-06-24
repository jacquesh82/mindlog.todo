import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import type { TaskAskInput, TaskAskResult } from '../domain/task.js';
import { ServiceUnavailable } from '../errors.js';
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
  'provided tasks. Cite tasks by their [n] index. Be concise. If the tasks do not ' +
  'contain enough information to answer, say so plainly.';

/** Retrieve the most relevant tasks and have Claude synthesize an answer (RAG). */
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

  const message = await getClient().messages.create({
    model: config.askModel,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: `Tasks:\n${context}\n\nQuestion: ${input.question}` },
    ],
  });

  const answer = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return {
    answer,
    sources: hits.map(({ score: _score, ...task }) => task),
  };
}
