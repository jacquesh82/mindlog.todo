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
  avatarUrl: string | null;
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
  noteSources?: { id: string; title: string; notebookId: string }[];
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

export interface ChatModelOption {
  id: string;
  provider: string;
  label: string;
}

export interface AiCredits {
  usedTokens: number;
  limitTokens: number;
  resetAt: string;
}

export interface ChatProviderOption {
  id: string;
  label: string;
}

export interface AiSettings {
  cloudHosted: boolean;
  provider: string;
  model: string;
  hasKey: boolean;
  providers: ChatProviderOption[];
  models: ChatModelOption[];
  credits: AiCredits | null;
}

export interface DashboardStats {
  tasks: {
    total: number;
    active: number;
    completed: number;
    overdue: number;
    dueToday: number;
    completedThisWeek: number;
    completionRate: number;
    byPriority: { p1: number; p2: number; p3: number; p4: number };
  };
  notes: {
    notebooks: number;
    pages: number;
    storageBytes: number;
    storageQuota: number;
  };
  completedTrend: { date: string; count: number }[];
  karma: Karma | null;
}

export type PromptKey = 'ask' | 'extract_tasks' | 'summarize';

export interface PromptView {
  key: PromptKey;
  system: string;
  user: string;
  isCustom: boolean;
  placeholders: string[];
}

export interface StorageUsage {
  notesBytes: number;
  attachmentsBytes: number;
  totalBytes: number;
  quota: number;
  cloudHosted: boolean;
}

export interface Attachment {
  id: string;
  taskId: string;
  userId: string;
  filename: string;
  mime: string | null;
  byteSize: number;
  createdAt: string;
  content?: string;
}

export interface Notebook {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotePage {
  id: string;
  notebookId: string;
  userId: string;
  title: string;
  content: string;
  position: number;
  inRag: boolean;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotePageSummary = Omit<NotePage, 'content'>;

export interface NoteHit extends NotePageSummary {
  score: number;
}

export interface CalendarSource {
  id: string;
  userId: string;
  name: string;
  url: string;
  color: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface ExternalEvent {
  uid: string;
  summary: string;
  start: string;
  end: string | null;
  allDay: boolean;
  sourceId: string;
  sourceName: string;
  color: string | null;
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
