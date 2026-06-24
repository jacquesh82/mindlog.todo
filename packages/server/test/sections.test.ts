import { closePool } from '@mindlog/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/rest/app.js';
import { ensureSchema, resetDb } from './helpers.js';

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function setup(email: string) {
  const reg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'password123' });
  const token = reg.body.accessToken as string;
  const project = await request(app)
    .post('/api/v1/projects')
    .set(auth(token))
    .send({ name: 'Work' });
  return { token, projectId: project.body.id as string };
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

describe('sections', () => {
  it('creates, lists, updates and deletes sections of a project', async () => {
    const { token, projectId } = await setup('sec@ex.com');

    const a = await request(app)
      .post('/api/v1/sections')
      .set(auth(token))
      .send({ projectId, name: 'To do', position: 0 });
    expect(a.status).toBe(201);
    await request(app)
      .post('/api/v1/sections')
      .set(auth(token))
      .send({ projectId, name: 'Doing', position: 1 });

    const list = await request(app)
      .get(`/api/v1/sections?projectId=${projectId}`)
      .set(auth(token));
    expect(list.body.map((s: { name: string }) => s.name)).toEqual(['To do', 'Doing']);

    const patched = await request(app)
      .patch(`/api/v1/sections/${a.body.id}`)
      .set(auth(token))
      .send({ name: 'Backlog' });
    expect(patched.body.name).toBe('Backlog');

    const del = await request(app).delete(`/api/v1/sections/${a.body.id}`).set(auth(token));
    expect(del.status).toBe(204);
    const after = await request(app)
      .get(`/api/v1/sections?projectId=${projectId}`)
      .set(auth(token));
    expect(after.body).toHaveLength(1);
  });

  it('rejects a section for a project the user does not own', async () => {
    const a = await setup('owner@ex.com');
    const b = await setup('intruder@ex.com');
    const res = await request(app)
      .post('/api/v1/sections')
      .set(auth(b.token))
      .send({ projectId: a.projectId, name: 'sneaky' });
    expect(res.status).toBe(400);
  });

  it('requires a projectId to list', async () => {
    const { token } = await setup('noproj@ex.com');
    const res = await request(app).get('/api/v1/sections').set(auth(token));
    expect(res.status).toBe(400);
  });
});
