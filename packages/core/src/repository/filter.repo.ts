import type { Filter, FilterUpdateInput } from '../domain/filter.js';
import { getPool } from '../db/pool.js';

const COLS = `id, user_id, name, query, color, position, created_at, updated_at`;

interface Row {
  id: string;
  user_id: string;
  name: string;
  query: string;
  color: string | null;
  position: number;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: Row): Filter {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    query: r.query,
    color: r.color,
    position: r.position,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function insert(
  userId: string,
  name: string,
  query: string,
  color: string | null,
  position: number,
): Promise<Filter> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO filters (user_id, name, query, color, position)
     VALUES ($1,$2,$3,$4,$5) RETURNING ${COLS}`,
    [userId, name, query, color, position],
  );
  return mapRow(rows[0]!);
}

export async function getById(userId: string, id: string): Promise<Filter | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM filters WHERE user_id = $1 AND id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function list(userId: string): Promise<Filter[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM filters WHERE user_id = $1 ORDER BY position, created_at`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function update(
  userId: string,
  id: string,
  patch: FilterUpdateInput,
): Promise<Filter | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId, id];
  let i = 3;
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.query !== undefined) set('query', patch.query);
  if (patch.color !== undefined) set('color', patch.color);
  if (patch.position !== undefined) set('position', patch.position);
  sets.push('updated_at = now()');
  const { rows } = await getPool().query<Row>(
    `UPDATE filters SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM filters WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}
