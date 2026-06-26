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

describe('karma & completion', () => {
  it('stamps completed_at and awards karma on completion', async () => {
    const token = await registerUser('karma@ex.com');
    const created = await request(app)
      .post('/api/v1/tasks')
      .set(auth(token))
      .send({ title: 'do it', priority: 1 });

    const done = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
      .send({ status: 'done' });
    expect(done.body.status).toBe('done');
    expect(done.body.completedAt).toBeTruthy();

    const karma = await request(app).get('/api/v1/karma').set(auth(token));
    expect(karma.body.points).toBe(8); // P1 completion
    expect(karma.body.level).toBe('Beginner');
    expect(karma.body.completedToday).toBe(1);
    expect(karma.body.streakDays).toBe(1);

    // The completed task shows under completed=true and is cleared on re-open.
    const completed = await request(app).get('/api/v1/tasks?completed=true').set(auth(token));
    expect(completed.body).toHaveLength(1);

    const reopened = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(auth(token))
      .send({ status: 'todo' });
    expect(reopened.body.completedAt).toBeNull();
  });

  it('does not double-award when patching an already-done task', async () => {
    const token = await registerUser('karma2@ex.com');
    const c = await request(app).post('/api/v1/tasks').set(auth(token)).send({ title: 't', priority: 4 });
    await request(app).patch(`/api/v1/tasks/${c.body.id}`).set(auth(token)).send({ status: 'done' });
    await request(app).patch(`/api/v1/tasks/${c.body.id}`).set(auth(token)).send({ progress: 100 });
    const karma = await request(app).get('/api/v1/karma').set(auth(token));
    expect(karma.body.points).toBe(2); // P4 once, not twice
  });
});
