import { type Karma, KARMA_POINTS_BY_PRIORITY, levelFor, streakFrom } from '../domain/karma.js';
import * as repo from '../repository/karma.repo.js';

/** Award karma for completing a task of the given priority. */
export function awardForCompletion(userId: string, priority: number): Promise<void> {
  const points = KARMA_POINTS_BY_PRIORITY[priority] ?? 2;
  return repo.addEvent(userId, points, 'task_completed');
}

export async function getKarma(userId: string, now: Date = new Date()): Promise<Karma> {
  const [points, counts, days] = await Promise.all([
    repo.totalPoints(userId),
    repo.completionCounts(userId),
    repo.completionDays(userId),
  ]);
  const { level, nextLevel, pointsToNext } = levelFor(points);
  return {
    points,
    level,
    nextLevel,
    pointsToNext,
    completedToday: counts.today,
    completedThisWeek: counts.week,
    streakDays: streakFrom(days, now),
  };
}
