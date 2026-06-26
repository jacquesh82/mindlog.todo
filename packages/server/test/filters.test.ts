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

describe('filters', () => {
  it('runs an ad-hoc filter query', async () => {
    const token = await registerUser('fq@ex.com');
    const work = await request(app).post('/api/v1/labels').set(auth(token)).send({ name: 'work' });
    await request(app)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'urgent work', priority: 1, labelIds: [work.body.id] });
    await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 'p1 no label', priority: 1 });
    await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 'p3 task', priority: 3 });

    const q = encodeURIComponent('(p1 | p2) & @work');
    const res = await request(app).get(`/api/v1/tasks/query?q=${q}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.map((t: { title: string }) => t.title)).toEqual(['urgent work']);
  });

  it('rejects an invalid query with 400', async () => {
    const token = await registerUser('fq-bad@ex.com');
    const res = await request(app).get('/api/v1/tasks/query?q=(p1').set(auth(token));
    expect(res.status).toBe(400);
  });

  it('saves a filter and runs it via /filters/:id/tasks', async () => {
    const token = await registerUser('fsave@ex.com');
    await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 'overdue one', dueDate: '2020-01-01T00:00:00Z' });
    await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 'future one', dueDate: '2999-01-01T00:00:00Z' });

    const filter = await request(app)
      .post('/api/v1/filters')
      .set(auth(token))
      .send({ name: 'Overdue', query: 'overdue', color: '#db4c3f' });
    expect(filter.status).toBe(201);

    const run = await request(app).get(`/api/v1/filters/${filter.body.id}/tasks`).set(auth(token));
    expect(run.body.map((t: { title: string }) => t.title)).toEqual(['overdue one']);
  });

  it('rejects saving a filter with an invalid query', async () => {
    const token = await registerUser('fsave-bad@ex.com');
    const res = await request(app)
      .post('/api/v1/filters')
      .set(auth(token))
      .send({ name: 'Bad', query: 'p1 &' });
    expect(res.status).toBe(400);
  });
});
