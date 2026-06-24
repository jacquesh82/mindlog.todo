import type { Task, TaskListQuery, TaskSearchHit, TaskStatus, TaskUpdateInput } from '../domain/task.js';
import { getPool, toVectorLiteral } from '../db/pool.js';

const COLS = `id, user_id, parent_id, project_id, section_id, title, description,
  assignee, due_date, status, priority, progress, position, created_at, updated_at`;

interface Row {
  id: string;
  user_id: string;
  parent_id: string | null;
  project_id: string | null;
  section_id: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  due_date: Date | null;
  status: TaskStatus;
  priority: number;
  progress: number;
  position: number;
  created_at: Date;
  updated_at: Date;
  score?: number;
}

function mapRow(r: Row): Task {
  return {
    id: r.id,
    userId: r.user_id,
    parentId: r.parent_id,
    projectId: r.project_id,
    sectionId: r.section_id,
    title: r.title,
    description: r.description,
    assignee: r.assignee,
    dueDate: r.due_date ? r.due_date.toISOString() : null,
    status: r.status,
    priority: r.priority,
    progress: r.progress,
    position: r.position,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface InsertTaskFields {
  title: string;
  description?: string | null;
  assignee?: string | null;
  dueDate?: Date | null;
  status?: TaskStatus;
  priority?: number;
  progress?: number;
  parentId?: string | null;
  projectId?: string | null;
  sectionId?: string | null;
  position?: number;
}

export async function insert(
  userId: string,
  fields: InsertTaskFields,
  embedding: number[] | null,
): Promise<Task> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO tasks
       (user_id, parent_id, project_id, section_id, title, description, assignee,
        due_date, status, priority, progress, position, embedding)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::vector)
     RETURNING ${COLS}`,
    [
      userId,
      fields.parentId ?? null,
      fields.projectId ?? null,
      fields.sectionId ?? null,
      fields.title,
      fields.description ?? null,
      fields.assignee ?? null,
      fields.dueDate ?? null,
      fields.status ?? 'todo',
      fields.priority ?? 4,
      fields.progress ?? 0,
      fields.position ?? 0,
      embedding ? toVectorLiteral(embedding) : null,
    ],
  );
  return mapRow(rows[0]!);
}

export async function getById(userId: string, id: string): Promise<Task | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM tasks WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function list(userId: string, q: TaskListQuery): Promise<Task[]> {
  const params: unknown[] = [userId];
  let where = 'user_id = $1';
  let i = 2;
  if (q.status) {
    where += ` AND status = $${i++}`;
    params.push(q.status);
  }
  if (q.priority) {
    where += ` AND priority = $${i++}`;
    params.push(q.priority);
  }
  if (q.projectId) {
    where += ` AND project_id = $${i++}`;
    params.push(q.projectId);
  }
  if (q.sectionId) {
    where += ` AND section_id = $${i++}`;
    params.push(q.sectionId);
  }
  if (q.assignee) {
    where += ` AND assignee = $${i++}`;
    params.push(q.assignee);
  }
  if (q.parentId) {
    where += ` AND parent_id = $${i++}`;
    params.push(q.parentId);
  } else if (q.root) {
    where += ' AND parent_id IS NULL';
  }
  const limIdx = i++;
  params.push(q.limit);
  const offIdx = i++;
  params.push(q.offset);
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM tasks WHERE ${where}
     ORDER BY position, created_at
     LIMIT $${limIdx} OFFSET $${offIdx}`,
    params,
  );
  return rows.map(mapRow);
}

/** All of a user's tasks (used to assemble a tree in memory). */
export async function listAll(userId: string): Promise<Task[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM tasks WHERE user_id = $1 ORDER BY position, created_at`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function update(
  userId: string,
  id: string,
  patch: TaskUpdateInput,
  embedding: number[] | null | undefined,
): Promise<Task | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };
  if (patch.title !== undefined) set('title', patch.title);
  if (patch.description !== undefined) set('description', patch.description);
  if (patch.assignee !== undefined) set('assignee', patch.assignee);
  if (patch.dueDate !== undefined) set('due_date', patch.dueDate);
  if (patch.status !== undefined) set('status', patch.status);
  if (patch.priority !== undefined) set('priority', patch.priority);
  if (patch.progress !== undefined) set('progress', patch.progress);
  if (patch.position !== undefined) set('position', patch.position);
  if (patch.parentId !== undefined) set('parent_id', patch.parentId);
  if (patch.projectId !== undefined) set('project_id', patch.projectId);
  if (patch.sectionId !== undefined) set('section_id', patch.sectionId);
  if (embedding !== undefined) {
    sets.push(`embedding = $${i++}::vector`);
    vals.push(embedding === null ? null : toVectorLiteral(embedding));
  }
  sets.push('updated_at = now()');

  const userIdx = i++;
  vals.push(userId);
  const idIdx = i++;
  vals.push(id);

  const { rows } = await getPool().query<Row>(
    `UPDATE tasks SET ${sets.join(', ')}
     WHERE user_id = $${userIdx} AND id = $${idIdx}
     RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM tasks WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}

/** IDs of all descendants of `id` (children, grandchildren, …) for this user. */
export async function descendantIds(userId: string, id: string): Promise<string[]> {
  const { rows } = await getPool().query<{ id: string }>(
    `WITH RECURSIVE d AS (
       SELECT id FROM tasks WHERE user_id = $1 AND parent_id = $2
       UNION ALL
       SELECT t.id FROM tasks t JOIN d ON t.parent_id = d.id WHERE t.user_id = $1
     )
     SELECT id FROM d`,
    [userId, id],
  );
  return rows.map((r) => r.id);
}

export async function search(
  userId: string,
  queryVec: number[],
  k: number,
  status?: TaskStatus,
): Promise<TaskSearchHit[]> {
  const vec = toVectorLiteral(queryVec);
  const params: unknown[] = [userId, vec];
  let where = 'user_id = $1 AND embedding IS NOT NULL';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  params.push(k);
  const kIdx = params.length;
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS}, 1 - (embedding <=> $2::vector) AS score
     FROM tasks WHERE ${where}
     ORDER BY embedding <=> $2::vector
     LIMIT $${kIdx}`,
    params,
  );
  return rows.map((r) => ({ ...mapRow(r), score: Number(r.score ?? 0) }));
}
