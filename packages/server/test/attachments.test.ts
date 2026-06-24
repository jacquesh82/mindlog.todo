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

describe('attachments (RAG)', () => {
  it('attaches text, lists it, and feeds it to semantic search', async () => {
    const token = await registerUser('att@ex.com');
    const task = await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 'Meeting notes' });

    const created = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(auth(token))
      .send({ filename: 'notes.txt', mime: 'text/plain', content: 'Discussed the quarterly budget and hiring plan.' });
    expect(created.status).toBe(201);
    expect(created.body.filename).toBe('notes.txt');
    expect(created.body.byteSize).toBeGreaterThan(0);

    const list = await request(app).get(`/api/v1/tasks/${task.body.id}/attachments`).set(auth(token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].content).toBeUndefined(); // content excluded from list

    const full = await request(app).get(`/api/v1/attachments/${created.body.id}`).set(auth(token));
    expect(full.body.content).toContain('quarterly budget');

    // The task is now findable by the attachment's content via semantic search.
    const hits = await request(app)
      .post('/api/v1/tasks/search')
      .set(auth(token))
      .send({ query: 'quarterly budget hiring', k: 5 });
    expect(hits.body.map((h: { id: string }) => h.id)).toContain(task.body.id);
  });

  it('deletes an attachment and isolates per user', async () => {
    const token = await registerUser('att2@ex.com');
    const task = await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 't' });
    const a = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(auth(token))
      .send({ filename: 'f.txt', content: 'hello' });
    const del = await request(app).delete(`/api/v1/attachments/${a.body.id}`).set(auth(token));
    expect(del.status).toBe(204);
    const list = await request(app).get(`/api/v1/tasks/${task.body.id}/attachments`).set(auth(token));
    expect(list.body).toHaveLength(0);

    const other = await registerUser('att-other@ex.com');
    const get = await request(app).get(`/api/v1/attachments/${a.body.id}`).set(auth(other));
    expect(get.status).toBe(404);
  });
});
