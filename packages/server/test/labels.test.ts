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

describe('labels', () => {
  it('creates, lists, updates and deletes labels', async () => {
    const token = await registerUser('lab@ex.com');

    const created = await request(app)
      .post('/api/v1/labels')
      .set(auth(token))
      .send({ name: 'home', color: '#4073ff' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('home');

    const patched = await request(app)
      .patch(`/api/v1/labels/${created.body.id}`)
      .set(auth(token))
      .send({ name: 'house', color: null });
    expect(patched.body.name).toBe('house');
    expect(patched.body.color).toBeNull();

    const list = await request(app).get('/api/v1/labels').set(auth(token));
    expect(list.body).toHaveLength(1);

    const del = await request(app).delete(`/api/v1/labels/${created.body.id}`).set(auth(token));
    expect(del.status).toBe(204);
  });

  it('rejects a duplicate name (case-insensitive) with 409', async () => {
    const token = await registerUser('dup-label@ex.com');
    await request(app).post('/api/v1/labels').set(auth(token)).send({ name: 'Work' });
    const dup = await request(app).post('/api/v1/labels').set(auth(token)).send({ name: 'work' });
    expect(dup.status).toBe(409);
  });

  it('isolates labels per user', async () => {
    const a = await registerUser('lab-a@ex.com');
    await request(app).post('/api/v1/labels').set(auth(a)).send({ name: 'mine' });
    const b = await registerUser('lab-b@ex.com');
    const list = await request(app).get('/api/v1/labels').set(auth(b));
    expect(list.body).toHaveLength(0);
  });
});
