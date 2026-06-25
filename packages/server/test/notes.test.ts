import { closePool, noteService } from '@mindlog/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/rest/app.js';
import { ensureSchema, resetDb } from './helpers.js';

const app = createApp();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function registerUser(email: string) {
  const res = await request(app).post('/api/v1/auth/register').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

beforeAll(async () => { await ensureSchema(); });
beforeEach(async () => { await resetDb(); });
afterAll(async () => { await closePool(); });

describe('notes (OneNote-lite)', () => {
  it('manages notebooks and pages', async () => {
    const token = await registerUser('notes@ex.com');

    const nb = await request(app).post('/api/v1/notes/notebooks').set(auth(token)).send({ name: 'Work', color: '#246fe0' });
    expect(nb.status).toBe(201);

    const page = await request(app)
      .post(`/api/v1/notes/notebooks/${nb.body.id}/pages`)
      .set(auth(token))
      .send({ title: 'Meeting', content: 'agenda…' });
    expect(page.status).toBe(201);

    // The pages list omits content (kept lean).
    const pages = await request(app).get(`/api/v1/notes/notebooks/${nb.body.id}/pages`).set(auth(token));
    expect(pages.body).toHaveLength(1);
    expect(pages.body[0].content).toBeUndefined();

    // The single-page fetch returns content; updating persists it.
    const full = await request(app).get(`/api/v1/notes/pages/${page.body.id}`).set(auth(token));
    expect(full.body.content).toBe('agenda…');
    const upd = await request(app).patch(`/api/v1/notes/pages/${page.body.id}`).set(auth(token)).send({ content: 'updated notes' });
    expect(upd.body.content).toBe('updated notes');

    // Deleting the notebook cascades its pages.
    await request(app).delete(`/api/v1/notes/notebooks/${nb.body.id}`).set(auth(token));
    const after = await request(app).get(`/api/v1/notes/pages/${page.body.id}`).set(auth(token));
    expect(after.status).toBe(404);
  });

  it('opts a page into the RAG so it becomes semantically searchable', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: 'rag@ex.com', password: 'password123' });
    const token = reg.body.accessToken as string;
    const userId = reg.body.user.id as string;
    const nb = await request(app).post('/api/v1/notes/notebooks').set(auth(token)).send({ name: 'NB' });
    const page = await request(app)
      .post(`/api/v1/notes/notebooks/${nb.body.id}/pages`)
      .set(auth(token))
      .send({ title: 'Budget', content: 'quarterly budget and hiring plan' });

    // Not in RAG yet → no hits.
    expect(await noteService.searchPages(userId, 'budget hiring', 5)).toHaveLength(0);

    // Opt in → embedded → searchable.
    await request(app).patch(`/api/v1/notes/pages/${page.body.id}`).set(auth(token)).send({ inRag: true });
    const hits = await noteService.searchPages(userId, 'budget hiring', 5);
    expect(hits.map((h) => h.id)).toContain(page.body.id);

    // Opt out → no longer searchable.
    await request(app).patch(`/api/v1/notes/pages/${page.body.id}`).set(auth(token)).send({ inRag: false });
    expect(await noteService.searchPages(userId, 'budget hiring', 5)).toHaveLength(0);
  });

  it('adds a whole notebook to the RAG and scopes search to it', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: 'bulkrag@ex.com', password: 'password123' });
    const token = reg.body.accessToken as string;
    const userId = reg.body.user.id as string;
    const a = await request(app).post('/api/v1/notes/notebooks').set(auth(token)).send({ name: 'A' });
    const b = await request(app).post('/api/v1/notes/notebooks').set(auth(token)).send({ name: 'B' });
    await request(app).post(`/api/v1/notes/notebooks/${a.body.id}/pages`).set(auth(token)).send({ title: 'p1', content: 'budget planning notes' });
    await request(app).post(`/api/v1/notes/notebooks/${a.body.id}/pages`).set(auth(token)).send({ title: 'p2', content: 'budget review' });
    await request(app).post(`/api/v1/notes/notebooks/${b.body.id}/pages`).set(auth(token)).send({ title: 'p3', content: 'budget elsewhere' });

    // Add all of notebook A to the RAG in one go.
    const bulk = await request(app).post(`/api/v1/notes/notebooks/${a.body.id}/rag`).set(auth(token)).send({ inRag: true });
    expect(bulk.body.updated).toBe(2);

    // Scoped search to A returns A's pages; scoped to B (not in RAG) is empty.
    const inA = await noteService.searchPages(userId, 'budget', 10, { notebookIds: [a.body.id] });
    expect(inA.length).toBe(2);
    const inB = await noteService.searchPages(userId, 'budget', 10, { notebookIds: [b.body.id] });
    expect(inB.length).toBe(0);
  });

  it('isolates notebooks per user', async () => {
    const a = await registerUser('notes-a@ex.com');
    await request(app).post('/api/v1/notes/notebooks').set(auth(a)).send({ name: 'mine' });
    const b = await registerUser('notes-b@ex.com');
    const list = await request(app).get('/api/v1/notes/notebooks').set(auth(b));
    expect(list.body).toHaveLength(0);
  });
});
