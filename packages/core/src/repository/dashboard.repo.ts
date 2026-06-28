import { getPool } from '../db/pool.js';

export interface TaskStatsRow {
  total: number;
  active: number;
  completed: number;
  overdue: number;
  dueToday: number;
  completedThisWeek: number;
  p1: number;
  p2: number;
  p3: number;
  p4: number;
}

export async function taskStats(userId: string): Promise<TaskStatsRow> {
  const { rows } = await getPool().query<Record<string, string>>(
    /* sql */ `
    SELECT
      count(*)                                                              AS total,
      count(*) FILTER (WHERE status <> 'done')                              AS active,
      count(*) FILTER (WHERE status = 'done')                               AS completed,
      count(*) FILTER (WHERE status <> 'done' AND due_date < now())         AS overdue,
      count(*) FILTER (WHERE status <> 'done'
                        AND due_date >= date_trunc('day', now())
                        AND due_date <  date_trunc('day', now()) + interval '1 day') AS due_today,
      count(*) FILTER (WHERE completed_at >= date_trunc('week', now()))     AS completed_this_week,
      count(*) FILTER (WHERE status <> 'done' AND priority = 1)             AS p1,
      count(*) FILTER (WHERE status <> 'done' AND priority = 2)             AS p2,
      count(*) FILTER (WHERE status <> 'done' AND priority = 3)             AS p3,
      count(*) FILTER (WHERE status <> 'done' AND priority = 4)             AS p4
    FROM tasks WHERE user_id = $1`,
    [userId],
  );
  const r = rows[0]!;
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    total: n('total'),
    active: n('active'),
    completed: n('completed'),
    overdue: n('overdue'),
    dueToday: n('due_today'),
    completedThisWeek: n('completed_this_week'),
    p1: n('p1'),
    p2: n('p2'),
    p3: n('p3'),
    p4: n('p4'),
  };
}

export interface NoteStatsRow {
  notebooks: number;
  pages: number;
  storageBytes: number;
}

export async function noteStats(userId: string): Promise<NoteStatsRow> {
  const { rows } = await getPool().query<Record<string, string>>(
    /* sql */ `
    SELECT
      (SELECT count(*) FROM notebooks  WHERE user_id = $1)                              AS notebooks,
      (SELECT count(*) FROM note_pages WHERE user_id = $1)                              AS pages,
      (SELECT COALESCE(sum(octet_length(content)), 0) FROM note_pages WHERE user_id = $1) AS storage_bytes`,
    [userId],
  );
  const r = rows[0]!;
  return {
    notebooks: Number(r.notebooks ?? 0),
    pages: Number(r.pages ?? 0),
    storageBytes: Number(r.storage_bytes ?? 0),
  };
}
