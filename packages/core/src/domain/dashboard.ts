import type { Karma } from './karma.js';

/** Aggregated KPIs for the Dashboard view (task management + note-taking). */
export interface DashboardStats {
  tasks: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    dueToday: number;
    completedThisWeek: number;
    completionRate: number; // 0..100, completed / total
    byPriority: { p1: number; p2: number; p3: number; p4: number };
  };
  notes: {
    notebooks: number;
    pages: number;
    storageBytes: number;
    storageQuota: number;
  };
  karma: Karma | null;
}
