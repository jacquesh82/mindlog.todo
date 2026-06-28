import type { Attachment } from '../domain/attachment.js';
import { getPool } from '../db/pool.js';

// `content` is excluded from list payloads (it can be large); fetched only when
// a single attachment is requested.
const LIST_COLS = `id, task_id, user_id, filename, mime, byte_size, created_at`;

interface Row {
  id: string;
  task_id: string;
  user_id: string;
  filename: string;
  mime: string | null;
  byte_size: number;
  created_at: Date;
  content?: string;
}

function mapRow(r: Row): Attachment {
  const a: Attachment = {
    id: r.id,
    taskId: r.task_id,
    userId: r.user_id,
    filename: r.filename,
    mime: r.mime,
    byteSize: r.byte_size,
    createdAt: r.created_at.toISOString(),
  };
  if (r.content !== undefined) a.content = r.content;
  return a;
}

export async function insert(
  userId: string,
  taskId: string,
  filename: string,
  mime: string | null,
  content: string,
): Promise<Attachment> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO attachments (task_id, user_id, filename, mime, content, byte_size)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING ${LIST_COLS}`,
    [taskId, userId, filename, mime, content, Buffer.byteLength(content, 'utf8')],
  );
  return mapRow(rows[0]!);
}

export async function listByTask(userId: string, taskId: string): Promise<Attachment[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${LIST_COLS} FROM attachments WHERE user_id = $1 AND task_id = $2 ORDER BY created_at`,
    [userId, taskId],
  );
  return rows.map(mapRow);
}

export async function getById(userId: string, id: string): Promise<Attachment | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${LIST_COLS}, content FROM attachments WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Returns the deleted attachment's task id (for re-embedding), or null. */
export async function remove(userId: string, id: string): Promise<string | null> {
  const { rows } = await getPool().query<{ task_id: string }>(
    `DELETE FROM attachments WHERE user_id = $1 AND id = $2 RETURNING task_id`,
    [userId, id],
  );
  return rows[0]?.task_id ?? null;
}

/** Total bytes of all attachments owned by a user. */
export async function userContentBytes(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ total: string | null }>(
    `SELECT COALESCE(sum(byte_size), 0) AS total FROM attachments WHERE user_id = $1`,
    [userId],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Concatenated attachment text for a task (used to enrich its embedding). */
export async function textForTask(taskId: string): Promise<string> {
  const { rows } = await getPool().query<{ filename: string; content: string }>(
    `SELECT filename, content FROM attachments WHERE task_id = $1 ORDER BY created_at`,
    [taskId],
  );
  return rows.map((r) => `${r.filename}\n${r.content}`).join('\n\n').trim();
}
