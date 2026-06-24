import type { Project, ProjectUpdateInput } from '../domain/project.js';
import { getPool } from '../db/pool.js';

const COLS = `id, user_id, name, color, parent_id, is_inbox, is_favorite,
  view_mode, position, archived_at, created_at, updated_at`;

interface Row {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  parent_id: string | null;
  is_inbox: boolean;
  is_favorite: boolean;
  view_mode: Project['viewMode'];
  position: number;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: Row): Project {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    parentId: r.parent_id,
    isInbox: r.is_inbox,
    isFavorite: r.is_favorite,
    viewMode: r.view_mode,
    position: r.position,
    archivedAt: r.archived_at ? r.archived_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface InsertProjectFields {
  name: string;
  color?: string | null;
  parentId?: string | null;
  isInbox?: boolean;
  isFavorite?: boolean;
  viewMode?: Project['viewMode'];
  position?: number;
}

export async function insert(userId: string, fields: InsertProjectFields): Promise<Project> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO projects
       (user_id, name, color, parent_id, is_inbox, is_favorite, view_mode, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING ${COLS}`,
    [
      userId,
      fields.name,
      fields.color ?? null,
      fields.parentId ?? null,
      fields.isInbox ?? false,
      fields.isFavorite ?? false,
      fields.viewMode ?? 'list',
      fields.position ?? 0,
    ],
  );
  return mapRow(rows[0]!);
}

export async function getById(userId: string, id: string): Promise<Project | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM projects WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function list(userId: string, includeArchived = false): Promise<Project[]> {
  const where = includeArchived ? 'user_id = $1' : 'user_id = $1 AND archived_at IS NULL';
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM projects WHERE ${where}
     ORDER BY is_inbox DESC, position, created_at`,
    [userId],
  );
  return rows.map(mapRow);
}

/** The user's Inbox project, or null if it has not been provisioned yet. */
export async function getInbox(userId: string): Promise<Project | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM projects WHERE user_id = $1 AND is_inbox LIMIT 1`,
    [userId],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Idempotently create the user's Inbox (safe under the partial unique index). */
export async function ensureInbox(userId: string): Promise<Project> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO projects (user_id, name, is_inbox)
     VALUES ($1, 'Inbox', true)
     ON CONFLICT (user_id) WHERE is_inbox DO NOTHING
     RETURNING ${COLS}`,
    [userId],
  );
  if (rows[0]) return mapRow(rows[0]);
  // Already existed → fetch it.
  return (await getInbox(userId))!;
}

export async function update(
  userId: string,
  id: string,
  patch: ProjectUpdateInput,
): Promise<Project | null> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.color !== undefined) set('color', patch.color);
  if (patch.parentId !== undefined) set('parent_id', patch.parentId);
  if (patch.isFavorite !== undefined) set('is_favorite', patch.isFavorite);
  if (patch.viewMode !== undefined) set('view_mode', patch.viewMode);
  if (patch.position !== undefined) set('position', patch.position);
  if (patch.archived !== undefined) set('archived_at', patch.archived ? new Date() : null);
  sets.push('updated_at = now()');

  const userIdx = i++;
  vals.push(userId);
  const idIdx = i++;
  vals.push(id);

  const { rows } = await getPool().query<Row>(
    `UPDATE projects SET ${sets.join(', ')}
     WHERE user_id = $${userIdx} AND id = $${idIdx}
     RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM projects WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}

/** IDs of all descendant projects (for cycle-guarding a re-parent). */
export async function descendantIds(userId: string, id: string): Promise<string[]> {
  const { rows } = await getPool().query<{ id: string }>(
    `WITH RECURSIVE d AS (
       SELECT id FROM projects WHERE user_id = $1 AND parent_id = $2
       UNION ALL
       SELECT p.id FROM projects p JOIN d ON p.parent_id = d.id WHERE p.user_id = $1
     )
     SELECT id FROM d`,
    [userId, id],
  );
  return rows.map((r) => r.id);
}
