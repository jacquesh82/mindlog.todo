import type {
  Notebook,
  NotebookUpdateInput,
  NotePage,
  NotePageHit,
  NotePageSummary,
  PageUpdateInput,
} from '../domain/note.js';
import { getPool, toVectorLiteral } from '../db/pool.js';

const NB_COLS = `id, user_id, name, color, position, created_at, updated_at`;
const PAGE_COLS = `id, notebook_id, user_id, title, content, position, in_rag, color, created_at, updated_at`;
// Same columns minus the (large) content, for lists / search hits.
const PAGE_LIST_COLS = `id, notebook_id, user_id, title, position, in_rag, color, created_at, updated_at`;

interface NbRow {
  id: string; user_id: string; name: string; color: string | null;
  position: number; created_at: Date; updated_at: Date;
}
interface PageRow {
  id: string; notebook_id: string; user_id: string; title: string; content: string;
  position: number; in_rag: boolean; color: string | null; created_at: Date; updated_at: Date; score?: number;
}

const nb = (r: NbRow): Notebook => ({
  id: r.id, userId: r.user_id, name: r.name, color: r.color, position: r.position,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});
const page = (r: PageRow): NotePage => ({
  id: r.id, notebookId: r.notebook_id, userId: r.user_id, title: r.title, content: r.content ?? '',
  position: r.position, inRag: r.in_rag, color: r.color,
  createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString(),
});

// --- Notebooks ---

export async function insertNotebook(userId: string, name: string, color: string | null): Promise<Notebook> {
  const { rows } = await getPool().query<NbRow>(
    `INSERT INTO notebooks (user_id, name, color) VALUES ($1,$2,$3) RETURNING ${NB_COLS}`,
    [userId, name, color],
  );
  return nb(rows[0]!);
}

export async function listNotebooks(userId: string): Promise<Notebook[]> {
  const { rows } = await getPool().query<NbRow>(
    `SELECT ${NB_COLS} FROM notebooks WHERE user_id = $1 ORDER BY position, created_at`,
    [userId],
  );
  return rows.map(nb);
}

export async function getNotebook(userId: string, id: string): Promise<Notebook | null> {
  const { rows } = await getPool().query<NbRow>(
    `SELECT ${NB_COLS} FROM notebooks WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? nb(rows[0]) : null;
}

export async function updateNotebook(userId: string, id: string, patch: NotebookUpdateInput): Promise<Notebook | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId, id];
  let i = 3;
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); vals.push(patch.name); }
  if (patch.color !== undefined) { sets.push(`color = $${i++}`); vals.push(patch.color); }
  sets.push('updated_at = now()');
  const { rows } = await getPool().query<NbRow>(
    `UPDATE notebooks SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING ${NB_COLS}`,
    vals,
  );
  return rows[0] ? nb(rows[0]) : null;
}

export async function removeNotebook(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM notebooks WHERE user_id = $1 AND id = $2', [userId, id]);
  return (rowCount ?? 0) > 0;
}

// --- Pages ---

export async function insertPage(userId: string, notebookId: string, title: string, content: string, position: number): Promise<NotePage> {
  const { rows } = await getPool().query<PageRow>(
    `INSERT INTO note_pages (user_id, notebook_id, title, content, position)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${PAGE_COLS}`,
    [userId, notebookId, title, content, position],
  );
  return page(rows[0]!);
}

export async function listPages(userId: string, notebookId: string): Promise<NotePageSummary[]> {
  const { rows } = await getPool().query<PageRow>(
    `SELECT ${PAGE_LIST_COLS}, '' AS content
     FROM note_pages WHERE user_id = $1 AND notebook_id = $2 ORDER BY position, created_at`,
    [userId, notebookId],
  );
  return rows.map(page).map(({ content: _c, ...rest }) => rest);
}

/** Store (or clear, when vec is null) a page's RAG embedding. */
export async function setEmbedding(id: string, vec: number[] | null): Promise<void> {
  await getPool().query(
    'UPDATE note_pages SET embedding = $2::vector WHERE id = $1',
    [id, vec ? toVectorLiteral(vec) : null],
  );
}

/** Semantic search over a user's RAG-enabled note pages (optionally scoped). */
export async function search(
  userId: string,
  queryVec: number[],
  k: number,
  scope?: { notebookIds?: string[]; pageIds?: string[] },
): Promise<NotePageHit[]> {
  const vec = toVectorLiteral(queryVec);
  const params: unknown[] = [userId, vec];
  let where = 'user_id = $1 AND in_rag AND embedding IS NOT NULL';
  if (scope?.notebookIds?.length) {
    params.push(scope.notebookIds);
    where += ` AND notebook_id = ANY($${params.length}::uuid[])`;
  }
  if (scope?.pageIds?.length) {
    params.push(scope.pageIds);
    where += ` AND id = ANY($${params.length}::uuid[])`;
  }
  params.push(k);
  const kIdx = params.length;
  const { rows } = await getPool().query<PageRow>(
    `SELECT ${PAGE_LIST_COLS}, '' AS content, 1 - (embedding <=> $2::vector) AS score
     FROM note_pages
     WHERE ${where}
     ORDER BY embedding <=> $2::vector
     LIMIT $${kIdx}`,
    params,
  );
  return rows.map((r) => {
    const { content: _c, ...rest } = page(r);
    return { ...rest, score: Number(r.score ?? 0) };
  });
}

export async function countPages(userId: string, notebookId: string): Promise<number> {
  const { rows } = await getPool().query<{ n: string }>(
    'SELECT count(*) AS n FROM note_pages WHERE user_id = $1 AND notebook_id = $2',
    [userId, notebookId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function getPage(userId: string, id: string): Promise<NotePage | null> {
  const { rows } = await getPool().query<PageRow>(
    `SELECT ${PAGE_COLS} FROM note_pages WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? page(rows[0]) : null;
}

export async function updatePage(userId: string, id: string, patch: PageUpdateInput): Promise<NotePage | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId, id];
  let i = 3;
  if (patch.title !== undefined) { sets.push(`title = $${i++}`); vals.push(patch.title); }
  if (patch.content !== undefined) { sets.push(`content = $${i++}`); vals.push(patch.content); }
  if (patch.position !== undefined) { sets.push(`position = $${i++}`); vals.push(patch.position); }
  if (patch.inRag !== undefined) { sets.push(`in_rag = $${i++}`); vals.push(patch.inRag); }
  if (patch.color !== undefined) { sets.push(`color = $${i++}`); vals.push(patch.color); }
  sets.push('updated_at = now()');
  const { rows } = await getPool().query<PageRow>(
    `UPDATE note_pages SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING ${PAGE_COLS}`,
    vals,
  );
  return rows[0] ? page(rows[0]) : null;
}

export async function removePage(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query('DELETE FROM note_pages WHERE user_id = $1 AND id = $2', [userId, id]);
  return (rowCount ?? 0) > 0;
}
