import type { CalendarSource, CalendarSourceUpdateInput } from '../domain/calendar.js';
import { getPool } from '../db/pool.js';

const COLS = `id, user_id, name, url, color, last_synced_at, created_at`;

interface Row {
  id: string;
  user_id: string;
  name: string;
  url: string;
  color: string | null;
  last_synced_at: Date | null;
  created_at: Date;
}

function mapRow(r: Row): CalendarSource {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    url: r.url,
    color: r.color,
    lastSyncedAt: r.last_synced_at ? r.last_synced_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
  };
}

export async function insert(
  userId: string,
  name: string,
  url: string,
  color: string | null,
): Promise<CalendarSource> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO calendar_sources (user_id, name, url, color) VALUES ($1,$2,$3,$4) RETURNING ${COLS}`,
    [userId, name, url, color],
  );
  return mapRow(rows[0]!);
}

export async function list(userId: string): Promise<CalendarSource[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM calendar_sources WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
  return rows.map(mapRow);
}

export async function update(
  userId: string,
  id: string,
  patch: CalendarSourceUpdateInput,
): Promise<CalendarSource | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId, id];
  let i = 3;
  const set = (col: string, val: unknown) => {
    sets.push(`${col} = $${i++}`);
    vals.push(val);
  };
  if (patch.name !== undefined) set('name', patch.name);
  if (patch.url !== undefined) set('url', patch.url);
  if (patch.color !== undefined) set('color', patch.color);
  if (sets.length === 0) return list(userId).then((all) => all.find((s) => s.id === id) ?? null);
  const { rows } = await getPool().query<Row>(
    `UPDATE calendar_sources SET ${sets.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'DELETE FROM calendar_sources WHERE user_id = $1 AND id = $2',
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}

export async function touchSynced(id: string): Promise<void> {
  await getPool().query('UPDATE calendar_sources SET last_synced_at = now() WHERE id = $1', [id]);
}
