import { getPool } from '../db/pool.js';

export async function addEvent(userId: string, points: number, reason: string): Promise<void> {
  await getPool().query(
    'INSERT INTO karma_events (user_id, points, reason) VALUES ($1,$2,$3)',
    [userId, points, reason],
  );
}

export async function totalPoints(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ total: string | null }>(
    'SELECT COALESCE(sum(points), 0) AS total FROM karma_events WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Tasks completed today (local server day) and so far this week. */
export async function completionCounts(
  userId: string,
): Promise<{ today: number; week: number }> {
  const { rows } = await getPool().query<{ today: string; week: string }>(
    `SELECT
       count(*) FILTER (WHERE completed_at::date = current_date) AS today,
       count(*) FILTER (WHERE completed_at >= date_trunc('week', now())) AS week
     FROM tasks WHERE user_id = $1 AND completed_at IS NOT NULL`,
    [userId],
  );
  return { today: Number(rows[0]?.today ?? 0), week: Number(rows[0]?.week ?? 0) };
}

/** Distinct days (most recent first) on which the user completed a task. */
export async function completionDays(userId: string, limit = 60): Promise<string[]> {
  const { rows } = await getPool().query<{ day: string }>(
    `SELECT DISTINCT completed_at::date::text AS day
       FROM tasks WHERE user_id = $1 AND completed_at IS NOT NULL
       ORDER BY day DESC LIMIT $2`,
    [userId, limit],
  );
  return rows.map((r) => r.day);
}
