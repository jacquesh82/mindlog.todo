import { closePool } from '@mindlog/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/rest/app.js';
import { ensureSchema, resetDb } from './helpers.js';

const app = createApp();

async function registerUser(email: string) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'password123', displayName: email });
  return res.body as { accessToken: string; user: { id: string } };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await ensureSchema();
});
beforeEach(async () => {
  await resetDb();
});
afterAll(async () => {
  await closePool();
});

describe('data export', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/export');
    expect(res.status).toBe(401);
  });

  it('returns a self-contained snapshot of the user data', async () => {
    const { accessToken } = await registerUser('export@ex.com');

    // Seed a task, a notebook + page so the export has content to carry.
    await request(app).post('/api/v1/tasks').set(auth(accessToken)).send({ title: 'Buy milk' });
    const nb = await request(app)
      .post('/api/v1/notes/notebooks')
      .set(auth(accessToken))
      .send({ name: 'Journal', color: '#246fe0' });
    await request(app)
      .post(`/api/v1/notes/notebooks/${nb.body.id}/pages`)
      .set(auth(accessToken))
      .send({ title: 'Day 1', content: 'hello' });

    const res = await request(app).get('/api/v1/export').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('mindlog-export.json');

    const body = res.body as Record<string, any>;
    expect(body.schema).toBe('mindlog.todo/export');
    expect(body.account.email).toBe('export@ex.com');
    expect(body.tasks.map((t: any) => t.title)).toContain('Buy milk');
    // An Inbox project is always provisioned.
    expect(body.projects.some((p: any) => p.isInbox)).toBe(true);
    // Notebooks come back with their pages and full page content inlined.
    expect(body.notes).toHaveLength(1);
    expect(body.notes[0].notebook.name).toBe('Journal');
    expect(body.notes[0].pages[0].content).toBe('hello');
  });

  it('keeps each user export isolated', async () => {
    const a = await registerUser('owner-a@ex.com');
    const b = await registerUser('owner-b@ex.com');
    await request(app).post('/api/v1/tasks').set(auth(a.accessToken)).send({ title: 'A secret' });

    const res = await request(app).get('/api/v1/export').set(auth(b.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.tasks.some((t: any) => t.title === 'A secret')).toBe(false);
  });
});
