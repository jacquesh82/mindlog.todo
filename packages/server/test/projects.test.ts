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

describe('projects', () => {
  it('provisions an Inbox on registration', async () => {
    const { accessToken } = await registerUser('inbox@ex.com');
    const list = await request(app).get('/api/v1/projects').set(auth(accessToken));
    expect(list.status).toBe(200);
    const inboxes = list.body.filter((p: { isInbox: boolean }) => p.isInbox);
    expect(inboxes).toHaveLength(1);
    expect(inboxes[0].name).toBe('Inbox');
  });

  it('creates, updates, archives and lists projects', async () => {
    const { accessToken } = await registerUser('proj@ex.com');

    const created = await request(app)
      .post('/api/v1/projects')
      .set(auth(accessToken))
      .send({ name: 'Work', color: '#db4c3f', viewMode: 'board' });
    expect(created.status).toBe(201);
    expect(created.body.isInbox).toBe(false);
    expect(created.body.viewMode).toBe('board');
    const id = created.body.id;

    const patched = await request(app)
      .patch(`/api/v1/projects/${id}`)
      .set(auth(accessToken))
      .send({ name: 'Job', isFavorite: true });
    expect(patched.body.name).toBe('Job');
    expect(patched.body.isFavorite).toBe(true);

    // Archive hides it from the default listing.
    await request(app).patch(`/api/v1/projects/${id}`).set(auth(accessToken)).send({ archived: true });
    const active = await request(app).get('/api/v1/projects').set(auth(accessToken));
    expect(active.body.find((p: { id: string }) => p.id === id)).toBeUndefined();
    const all = await request(app)
      .get('/api/v1/projects?includeArchived=true')
      .set(auth(accessToken));
    expect(all.body.find((p: { id: string }) => p.id === id)).toBeTruthy();
  });

  it('refuses to delete or archive the Inbox', async () => {
    const { accessToken } = await registerUser('protect@ex.com');
    const list = await request(app).get('/api/v1/projects').set(auth(accessToken));
    const inbox = list.body.find((p: { isInbox: boolean }) => p.isInbox);

    const del = await request(app).delete(`/api/v1/projects/${inbox.id}`).set(auth(accessToken));
    expect(del.status).toBe(400);
    const arch = await request(app)
      .patch(`/api/v1/projects/${inbox.id}`)
      .set(auth(accessToken))
      .send({ archived: true });
    expect(arch.status).toBe(400);
  });

  it('guards against parent cycles', async () => {
    const { accessToken } = await registerUser('cycle@ex.com');
    const a = await request(app).post('/api/v1/projects').set(auth(accessToken)).send({ name: 'A' });
    const b = await request(app)
      .post('/api/v1/projects')
      .set(auth(accessToken))
      .send({ name: 'B', parentId: a.body.id });
    // Trying to move A under its own child B must fail.
    const res = await request(app)
      .patch(`/api/v1/projects/${a.body.id}`)
      .set(auth(accessToken))
      .send({ parentId: b.body.id });
    expect(res.status).toBe(400);
  });

  it('isolates projects per user', async () => {
    const a = await registerUser('iso-a@ex.com');
    await request(app).post('/api/v1/projects').set(auth(a.accessToken)).send({ name: 'secret' });
    const b = await registerUser('iso-b@ex.com');
    const list = await request(app).get('/api/v1/projects').set(auth(b.accessToken));
    // b only sees its own Inbox.
    expect(list.body.every((p: { isInbox: boolean }) => p.isInbox)).toBe(true);
  });
});
