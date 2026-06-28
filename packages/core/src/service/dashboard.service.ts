import type { DashboardStats } from '../domain/dashboard.js';
import { USER_NOTES_QUOTA } from '../domain/note.js';
import * as repo from '../repository/dashboard.repo.js';
import { getKarma } from './karma.service.js';

export async function getDashboard(userId: string): Promise<DashboardStats> {
  const [tasks, notes, karma] = await Promise.all([
    repo.taskStats(userId),
    repo.noteStats(userId),
    getKarma(userId).catch(() => null),
  ]);

  return {
    tasks: {
      total: tasks.total,
      active: tasks.active,
      completed: tasks.completed,
      overdue: tasks.overdue,
      dueToday: tasks.dueToday,
      completedThisWeek: tasks.completedThisWeek,
      completionRate: tasks.total ? Math.round((tasks.completed / tasks.total) * 100) : 0,
      byPriority: { p1: tasks.p1, p2: tasks.p2, p3: tasks.p3, p4: tasks.p4 },
    },
    notes: {
      notebooks: notes.notebooks,
      pages: notes.pages,
      storageBytes: notes.storageBytes,
      storageQuota: USER_NOTES_QUOTA,
    },
    karma,
  };
}
