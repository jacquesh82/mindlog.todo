export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  userId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  dueDate: string | null;
  status: TaskStatus;
  progress: number;
  position: number;
  createdAt: string;
  updatedAt: string;
  children?: Task[];
}

export interface TaskHit extends Task {
  score: number;
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
