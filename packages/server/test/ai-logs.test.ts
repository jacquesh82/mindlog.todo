import { aiLogService, closePool } from '@mindlog/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/rest/app.js';
import { ensureSchema, resetDb } from './helpers.js';

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function registerUser(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'password123' });
  return res.body as { accessToken: string; user: { id: string } };
}

beforeAll(async () => {
  await ensureSchema();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePool();
});

describe('AI activity log', () => {
  it('records calls and aggregates token usage', async () => {
    const { accessToken, user } = await registerUser('ai@ex.com');

    // The real `ask` needs an Anthropic key; record directly to exercise the API.
    await aiLogService.record(user.id, {
      kind: 'ask',
      model: 'claude-sonnet-4-6',
      prompt: 'Tasks: …\n\nQuestion: what is overdue?',
      response: 'You have 2 overdue tasks.',
      inputTokens: 120,
      outputTokens: 30,
    });
    await aiLogService.record(user.id, {
      kind: 'ask',
      model: 'claude-sonnet-4-6',
      prompt: 'another question',
      response: 'another answer',
      inputTokens: 80,
      outputTokens: 20,
    });

    const usage = await request(app).get('/api/v1/ai/usage').set(auth(accessToken));
    expect(usage.body).toEqual({ calls: 2, inputTokens: 200, outputTokens: 50, totalTokens: 250 });

    const logs = await request(app).get('/api/v1/ai/logs').set(auth(accessToken));
    expect(logs.body).toHaveLength(2);
    // Most-recent first; prompt and response are stored verbatim.
    expect(logs.body[0].prompt).toBe('another question');
    expect(logs.body[1].response).toBe('You have 2 overdue tasks.');
  });

  it('isolates logs per user and requires auth', async () => {
    expect((await request(app).get('/api/v1/ai/logs')).status).toBe(401);
    const a = await registerUser('ai-a@ex.com');
    await aiLogService.record(a.user.id, { kind: 'ask', prompt: 'secret', inputTokens: 1, outputTokens: 1 });
    const b = await registerUser('ai-b@ex.com');
    const logs = await request(app).get('/api/v1/ai/logs').set(auth(b.accessToken));
    expect(logs.body).toHaveLength(0);
  });
});
