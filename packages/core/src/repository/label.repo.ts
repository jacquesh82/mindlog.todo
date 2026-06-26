import type { Label, LabelUpdateInput } from '../domain/label.js';
import { getPool } from '../db/pool.js';

const COLS = `id, user_id, name, color, is_favorite, created_at, updated_at`;

interface Row {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  is_favorite: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: Row): Label {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    color: r.color,
    isFavorite: r.is_favorite,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function insert(
  userId: string,
  name: string,
  color: string | null,
  isFavorite = false,
): Promise<Label> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO labels (user_id, name, color, is_favorite) VALUES ($1,$2,$3,$4) RETURNING ${COLS}`,
    [userId, name, color, isFavorite],
  );
  return mapRow(rows[0]!);
}

export async function getById(userId: string, id: string): Promise<Label | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM labels WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

/** Find a label by name (case-insensitive). */
export async function findByName(userId: string, name: string): Promise<Label | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM labels WHERE user_id = $1 AND lower(name) = lower($2) LIMIT 1`,
    [userId, name],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function list(userId: string): Promise<Label[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM labels WHERE user_id = $1 ORDER BY lower(name)`,
    [userId],
  );
  return rows.map(mapRow);
}

/** Resolve a set of label ids the user actually owns (for validation). */
export async function ownedIds(userId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { rows } = await getPool().query<{ id: string }>(
    `SELECT id FROM labels WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, ids],
  );
  return rows.map((r) => r.id);
}

export async function update(
  userId: string,
  id: string,
  patch: LabelUpdateInput,
): Promise<Label | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId, id];
  let i = 3;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    vals.push(patch.name);
  }
  if (patch.color !== undefined) {
    sets.push(`color = $${i++}`);
    vals.push(patch.color);
  }
  if (patch.isFavorite !== undefined) {
    sets.push(`is_favorite = $${i++}`);
    vals.push(patch.isFavorite);
  }
  sets.push('updated_at = now()');
  const { rows } = await getPool().query<Row>(
    `UPDATE labels SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM labels WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}
