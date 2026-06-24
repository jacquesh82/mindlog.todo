export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  userId: string;
  parentId: string | null;
  projectId: string | null;
  sectionId: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  dueDate: string | null;
  deadline: string | null;
  durationMinutes: number | null;
  recurrence: string | null;
  status: TaskStatus;
  priority: number;
  progress: number;
  position: number;
  labelIds: string[];
  createdAt: string;
  updatedAt: string;
  children?: Task[];
}

export interface TaskHit extends Task {
  score: number;
}

export const PROJECT_VIEW_MODES = ['list', 'board', 'calendar'] as const;
export type ProjectViewMode = (typeof PROJECT_VIEW_MODES)[number];

export interface Project {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  parentId: string | null;
  isInbox: boolean;
  isFavorite: boolean;
  viewMode: ProjectViewMode;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface Label {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Filter {
  id: string;
  userId: string;
  name: string;
  query: string;
  color: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuickAddPreview {
  title: string;
  projectName: string | null;
  labelNames: string[];
  priority: number | null;
  dueDate: string | null;
  recurrence: string | null;
  projectId: string | null;
  labelIds: string[];
  newLabelNames: string[];
}

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  googleSub: string | null;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  name: string | null;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  secret?: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AskResult {
  answer: string;
  sources: Task[];
}

export interface AiLog {
  id: string;
  userId: string;
  kind: string;
  model: string | null;
  prompt: string;
  response: string | null;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}

export interface AiUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface Karma {
  points: number;
  level: string;
  nextLevel: string | null;
  pointsToNext: number | null;
  completedToday: number;
  completedThisWeek: number;
  streakDays: number;
}
