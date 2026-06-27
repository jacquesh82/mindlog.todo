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

describe('calendar sources', () => {
  it('creates, lists and deletes a source', async () => {
    const token = await registerUser('cal@ex.com');
    const created = await request(app)
      .post('/api/v1/calendar/sources')
      .set(auth(token))
      .send({ name: 'Team', url: 'https://example.com/team.ics', color: '#246fe0' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Team');

    const list = await request(app).get('/api/v1/calendar/sources').set(auth(token));
    expect(list.body).toHaveLength(1);

    const del = await request(app).delete(`/api/v1/calendar/sources/${created.body.id}`).set(auth(token));
    expect(del.status).toBe(204);
  });

  it('rejects a non-URL source', async () => {
    const token = await registerUser('cal-bad@ex.com');
    const res = await request(app)
      .post('/api/v1/calendar/sources')
      .set(auth(token))
      .send({ name: 'x', url: 'not a url' });
    expect(res.status).toBe(400);
  });

  it('returns no events when there are no sources', async () => {
    const token = await registerUser('cal-empty@ex.com');
    const res = await request(app).get('/api/v1/calendar/events').set(auth(token));
    expect(res.body).toEqual([]);
  });
});

describe('mindlog id calendar connection', () => {
  it('reports not-connected for a password account and disconnect is idempotent', async () => {
    const token = await registerUser('mlcal@ex.com');

    const status = await request(app).get('/api/v1/calendar/mindlog-id').set(auth(token));
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ connected: false, agendaGranted: false });

    // No connection yet → disconnect is a no-op but still succeeds.
    const del = await request(app).delete('/api/v1/calendar/mindlog-id').set(auth(token));
    expect(del.status).toBe(204);
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/calendar/mindlog-id');
    expect(res.status).toBe(401);
  });
});
