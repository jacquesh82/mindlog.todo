/** Karma levels by cumulative points, lowest threshold first. */
export const KARMA_LEVELS = [
  { name: 'Beginner', min: 0 },
  { name: 'Novice', min: 50 },
  { name: 'Intermediate', min: 150 },
  { name: 'Professional', min: 400 },
  { name: 'Expert', min: 1000 },
  { name: 'Master', min: 2500 },
  { name: 'Grandmaster', min: 5000 },
  { name: 'Enlightened', min: 10000 },
] as const;

/** Points awarded for completing a task, by priority (P1 worth the most). */
export const KARMA_POINTS_BY_PRIORITY: Record<number, number> = { 1: 8, 2: 6, 3: 4, 4: 2 };

export interface Karma {
  points: number;
  level: string;
  nextLevel: string | null;
  pointsToNext: number | null;
  completedToday: number;
  completedThisWeek: number;
  streakDays: number;
}

interface Level {
  name: string;
  min: number;
}

export function levelFor(points: number): { level: string; nextLevel: string | null; pointsToNext: number | null } {
  let current: Level = KARMA_LEVELS[0]!;
  let next: Level | null = null;
  for (let i = 0; i < KARMA_LEVELS.length; i++) {
    if (points >= KARMA_LEVELS[i]!.min) {
      current = KARMA_LEVELS[i]!;
      next = KARMA_LEVELS[i + 1] ?? null;
    }
  }
  return {
    level: current.name,
    nextLevel: next?.name ?? null,
    pointsToNext: next ? next.min - points : null,
  };
}

/**
 * Consecutive-day streak ending today or yesterday, from a descending list of
 * completion days (YYYY-MM-DD). A gap of more than one day ends the streak.
 */
export function streakFrom(days: string[], today: Date): number {
  if (days.length === 0) return 0;
  const set = new Set(days);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  // Allow the streak to count from today, or from yesterday if nothing today.
  if (!set.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (set.has(iso(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}
