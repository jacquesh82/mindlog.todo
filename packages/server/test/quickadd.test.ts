import { closePool } from '@mindlog/core';
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
  return res.body.accessToken as string;
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

describe('quick add', () => {
  it('creates a task from a natural-language line, resolving project and labels', async () => {
    const token = await registerUser('qa@ex.com');
    const work = await request(app).post('/api/v1/projects').set(auth(token)).send({ name: 'Work' });

    const res = await request(app)
      .post('/api/v1/tasks/quickadd')
      .set(auth(token))
      .send({ text: 'Submit report #Work @urgent p1 every week' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Submit report');
    expect(res.body.projectId).toBe(work.body.id);
    expect(res.body.priority).toBe(1);
    expect(res.body.recurrence).toBe('every week');
    expect(res.body.labelIds).toHaveLength(1);

    // The @urgent label was created on the fly.
    const labels = await request(app).get('/api/v1/labels').set(auth(token));
    expect(labels.body.map((l: { name: string }) => l.name)).toContain('urgent');
  });

  it('falls back to the Inbox when the #project is unknown', async () => {
    const token = await registerUser('qa-inbox@ex.com');
    const inbox = (await request(app).get('/api/v1/projects').set(auth(token))).body.find(
      (p: { isInbox: boolean }) => p.isInbox,
    );
    const res = await request(app)
      .post('/api/v1/tasks/quickadd')
      .set(auth(token))
      .send({ text: 'Buy milk #Groceries' });
    expect(res.body.projectId).toBe(inbox.id);
    expect(res.body.title).toBe('Buy milk');
  });

  it('previews a line without creating anything', async () => {
    const token = await registerUser('qa-preview@ex.com');
    const res = await request(app)
      .post('/api/v1/tasks/parse')
      .set(auth(token))
      .send({ text: 'Plan trip @travel p2' });
    expect(res.body.title).toBe('Plan trip');
    expect(res.body.priority).toBe(2);
    expect(res.body.newLabelNames).toContain('travel');

    // Nothing was created.
    const tasks = await request(app).get('/api/v1/tasks').set(auth(token));
    expect(tasks.body).toHaveLength(0);
  });
});
