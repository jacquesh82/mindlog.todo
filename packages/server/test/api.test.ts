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
  return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
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

describe('auth', () => {
  it('registers and returns tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'a@ex.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('a@ex.com');
  });

  it('rejects duplicate email with 409', async () => {
    await registerUser('dup@ex.com');
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dup@ex.com', password: 'password123' });
    expect(res.status).toBe(409);
  });

  it('rejects short password with 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'b@ex.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await registerUser('c@ex.com');
    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'c@ex.com', password: 'password123' });
    expect(ok.status).toBe(200);
    const bad = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'c@ex.com', password: 'wrongpass' });
    expect(bad.status).toBe(401);
  });

  it('rotates refresh tokens', async () => {
    const { refreshToken } = await registerUser('r@ex.com');
    const first = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);
    // old token is now revoked
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(reuse.status).toBe(401);
  });
});

describe('tasks', () => {
  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/tasks')).status).toBe(401);
  });

  it('creates, reads, updates and deletes a task', async () => {
    const { accessToken } = await registerUser('t@ex.com');
    const create = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({
        title: 'Write report',
        assignee: 'alice',
        dueDate: '2026-07-01T10:00:00Z',
        status: 'in_progress',
        progress: 20,
      });
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(create.body.status).toBe('in_progress');

    const patch = await request(app)
      .patch(`/api/v1/tasks/${id}`)
      .set(auth(accessToken))
      .send({ progress: 75 });
    expect(patch.body.progress).toBe(75);

    const get = await request(app).get(`/api/v1/tasks/${id}`).set(auth(accessToken));
    expect(get.body.id).toBe(id);

    const del = await request(app).delete(`/api/v1/tasks/${id}`).set(auth(accessToken));
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/v1/tasks/${id}`).set(auth(accessToken));
    expect(after.status).toBe(404);
  });

  it('defaults priority to P4 and round-trips an explicit priority', async () => {
    const { accessToken } = await registerUser('prio@ex.com');

    const plain = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'no priority' });
    expect(plain.body.priority).toBe(4);

    const urgent = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'urgent', priority: 1 });
    expect(urgent.body.priority).toBe(1);

    const patched = await request(app)
      .patch(`/api/v1/tasks/${plain.body.id}`)
      .set(auth(accessToken))
      .send({ priority: 2 });
    expect(patched.body.priority).toBe(2);

    const p1Only = await request(app).get('/api/v1/tasks?priority=1').set(auth(accessToken));
    expect(p1Only.body).toHaveLength(1);
    expect(p1Only.body[0].title).toBe('urgent');
  });

  it('rejects an out-of-range priority with 400', async () => {
    const { accessToken } = await registerUser('badprio@ex.com');
    const res = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'x', priority: 9 });
    expect(res.status).toBe(400);
  });

  it('defaults a new task to the Inbox project', async () => {
    const { accessToken } = await registerUser('taskinbox@ex.com');
    const projects = await request(app).get('/api/v1/projects').set(auth(accessToken));
    const inbox = projects.body.find((p: { isInbox: boolean }) => p.isInbox);

    const created = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'loose task' });
    expect(created.body.projectId).toBe(inbox.id);
    expect(created.body.sectionId).toBeNull();
  });

  it('places a task in a project + section and moving project clears the section', async () => {
    const { accessToken } = await registerUser('taskmove@ex.com');
    const projA = await request(app).post('/api/v1/projects').set(auth(accessToken)).send({ name: 'A' });
    const projB = await request(app).post('/api/v1/projects').set(auth(accessToken)).send({ name: 'B' });
    const section = await request(app)
      .post('/api/v1/sections')
      .set(auth(accessToken))
      .send({ projectId: projA.body.id, name: 'Col' });

    const created = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 't', projectId: projA.body.id, sectionId: section.body.id });
    expect(created.body.projectId).toBe(projA.body.id);
    expect(created.body.sectionId).toBe(section.body.id);

    // Move to project B — the section (which belongs to A) must be cleared.
    const moved = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(auth(accessToken))
      .send({ projectId: projB.body.id });
    expect(moved.body.projectId).toBe(projB.body.id);
    expect(moved.body.sectionId).toBeNull();

    // Listing by project filters correctly.
    const inB = await request(app)
      .get(`/api/v1/tasks?projectId=${projB.body.id}`)
      .set(auth(accessToken));
    expect(inB.body).toHaveLength(1);
  });

  it('rejects a section that belongs to a different project', async () => {
    const { accessToken } = await registerUser('badsection@ex.com');
    const projA = await request(app).post('/api/v1/projects').set(auth(accessToken)).send({ name: 'A' });
    const projB = await request(app).post('/api/v1/projects').set(auth(accessToken)).send({ name: 'B' });
    const sectionA = await request(app)
      .post('/api/v1/sections')
      .set(auth(accessToken))
      .send({ projectId: projA.body.id, name: 'Col' });

    const res = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 't', projectId: projB.body.id, sectionId: sectionA.body.id });
    expect(res.status).toBe(400);
  });

  it('deletes a project and cascades its tasks', async () => {
    const { accessToken } = await registerUser('cascadeproj@ex.com');
    const proj = await request(app).post('/api/v1/projects').set(auth(accessToken)).send({ name: 'Temp' });
    const task = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'doomed', projectId: proj.body.id });

    await request(app).delete(`/api/v1/projects/${proj.body.id}`).set(auth(accessToken));
    const after = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(auth(accessToken));
    expect(after.status).toBe(404);
  });

  it('nests sub-tasks and returns a tree', async () => {
    const { accessToken } = await registerUser('tree@ex.com');
    const root = await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'Parent' });
    const sub = await request(app)
      .post(`/api/v1/tasks/${root.body.id}/subtasks`)
      .set(auth(accessToken))
      .send({ title: 'Child' });
    expect(sub.body.parentId).toBe(root.body.id);

    const tree = await request(app).get('/api/v1/tasks?tree=true').set(auth(accessToken));
    expect(tree.body).toHaveLength(1);
    expect(tree.body[0].children).toHaveLength(1);
    expect(tree.body[0].children[0].title).toBe('Child');
  });

  it('deletes sub-tasks on cascade', async () => {
    const { accessToken } = await registerUser('cascade@ex.com');
    const root = await request(app).post('/api/v1/tasks').set(auth(accessToken)).send({ title: 'P' });
    await request(app)
      .post(`/api/v1/tasks/${root.body.id}/subtasks`)
      .set(auth(accessToken))
      .send({ title: 'C' });
    await request(app).delete(`/api/v1/tasks/${root.body.id}`).set(auth(accessToken));
    const list = await request(app).get('/api/v1/tasks').set(auth(accessToken));
    expect(list.body).toHaveLength(0);
  });

  it('guards against parenting cycles', async () => {
    const { accessToken } = await registerUser('cycle@ex.com');
    const root = await request(app).post('/api/v1/tasks').set(auth(accessToken)).send({ title: 'P' });
    const sub = await request(app)
      .post(`/api/v1/tasks/${root.body.id}/subtasks`)
      .set(auth(accessToken))
      .send({ title: 'C' });
    const res = await request(app)
      .patch(`/api/v1/tasks/${root.body.id}`)
      .set(auth(accessToken))
      .send({ parentId: sub.body.id });
    expect(res.status).toBe(400);
  });

  it('isolates tasks per user', async () => {
    const a = await registerUser('owner@ex.com');
    await request(app).post('/api/v1/tasks').set(auth(a.accessToken)).send({ title: 'secret' });
    const b = await registerUser('other@ex.com');
    const list = await request(app).get('/api/v1/tasks').set(auth(b.accessToken));
    expect(list.body).toHaveLength(0);
  });

  it('semantic search ranks the relevant task first', async () => {
    const { accessToken } = await registerUser('search@ex.com');
    await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'Quarterly financial report', description: 'revenue and expenses' });
    await request(app)
      .post('/api/v1/tasks')
      .set(auth(accessToken))
      .send({ title: 'Buy office plants' });
    const res = await request(app)
      .post('/api/v1/tasks/search')
      .set(auth(accessToken))
      .send({ query: 'financial report', k: 5 });
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].title).toBe('Quarterly financial report');
    expect(res.body[0].score).toBeGreaterThan(0);
  });
});

describe('api keys', () => {
  it('creates (secret once), lists and revokes keys', async () => {
    const { accessToken } = await registerUser('keys@ex.com');
    const created = await request(app)
      .post('/api/v1/api-keys')
      .set(auth(accessToken))
      .send({ name: 'mcp' });
    expect(created.status).toBe(201);
    expect(created.body.secret).toMatch(/^mlt_/);
    expect(created.body.prefix).toMatch(/^mlt_/);

    const list = await request(app).get('/api/v1/api-keys').set(auth(accessToken));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].secret).toBeUndefined(); // never returned again

    const del = await request(app)
      .delete(`/api/v1/api-keys/${created.body.id}`)
      .set(auth(accessToken));
    expect(del.status).toBe(204);
  });

  it('authenticates requests with an API key', async () => {
    const { accessToken } = await registerUser('keyauth@ex.com');
    const created = await request(app)
      .post('/api/v1/api-keys')
      .set(auth(accessToken))
      .send({});
    const res = await request(app).get('/api/v1/tasks').set(auth(created.body.secret));
    expect(res.status).toBe(200);
  });
});

describe('meta', () => {
  it('serves health and OpenAPI', async () => {
    expect((await request(app).get('/health')).body.status).toBe('ok');
    const spec = await request(app).get('/openapi.json');
    expect(spec.body.openapi).toBe('3.1.0');
    expect(Object.keys(spec.body.paths).length).toBeGreaterThan(0);
  });
});
