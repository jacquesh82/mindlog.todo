import type { Section, SectionUpdateInput } from '../domain/section.js';
import { getPool } from '../db/pool.js';

const COLS = `s.id, s.project_id, s.name, s.position, s.created_at, s.updated_at`;

interface Row {
  id: string;
  project_id: string;
  name: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

function mapRow(r: Row): Section {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    position: r.position,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

// All reads/writes join `projects` so a section is only ever visible to the
// owner of its project — sections carry no user_id of their own.
const OWNED = 'JOIN projects p ON p.id = s.project_id AND p.user_id = $1';

export async function insert(
  projectId: string,
  name: string,
  position = 0,
): Promise<Section> {
  const { rows } = await getPool().query<Row>(
    `INSERT INTO sections (project_id, name, position)
     VALUES ($1, $2, $3)
     RETURNING id, project_id, name, position, created_at, updated_at`,
    [projectId, name, position],
  );
  return mapRow(rows[0]!);
}

export async function getById(userId: string, id: string): Promise<Section | null> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM sections s ${OWNED} WHERE s.id = $2`,
    [userId, id],
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listByProject(userId: string, projectId: string): Promise<Section[]> {
  const { rows } = await getPool().query<Row>(
    `SELECT ${COLS} FROM sections s ${OWNED}
     WHERE s.project_id = $2
     ORDER BY s.position, s.created_at`,
    [userId, projectId],
  );
  return rows.map(mapRow);
}

export async function update(
  userId: string,
  id: string,
  patch: SectionUpdateInput,
): Promise<Section | null> {
  const sets: string[] = [];
  const vals: unknown[] = [userId, id];
  let i = 3;
  if (patch.name !== undefined) {
    sets.push(`name = $${i++}`);
    vals.push(patch.name);
  }
  if (patch.position !== undefined) {
    sets.push(`position = $${i++}`);
    vals.push(patch.position);
  }
  sets.push('updated_at = now()');

  const { rows } = await getPool().query<Row>(
    `UPDATE sections s SET ${sets.join(', ')}
     FROM projects p
     WHERE p.id = s.project_id AND p.user_id = $1 AND s.id = $2
     RETURNING ${COLS}`,
    vals,
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function remove(userId: string, id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `DELETE FROM sections s
     USING projects p
     WHERE p.id = s.project_id AND p.user_id = $1 AND s.id = $2`,
    [userId, id],
  );
  return (rowCount ?? 0) > 0;
}
