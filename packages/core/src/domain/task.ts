import { z } from 'zod';

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * Todoist-style priority. 1 = P1 (urgent), 4 = P4 (none) and the default.
 * Lower number = higher urgency, so `ORDER BY priority` surfaces P1 first.
 */
export const TASK_PRIORITY_MIN = 1;
export const TASK_PRIORITY_MAX = 4;
export const TASK_PRIORITY_DEFAULT = 4;
const prioritySchema = z.coerce
  .number()
  .int()
  .min(TASK_PRIORITY_MIN)
  .max(TASK_PRIORITY_MAX);

/** A calendar date with no time component, e.g. a deadline. */
const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date');

/** Parse a query-string flag without the `z.coerce.boolean()` "false"->true trap. */
const boolish = z.preprocess(
  (v) => v === true || v === 'true' || v === '1',
  z.boolean(),
);

/** Body for creating a task (or sub-task when `parentId` is set). */
export const taskCreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  assignee: z.string().max(200).optional(),
  dueDate: z.coerce.date().optional(),
  deadline: dateOnlySchema.optional(),
  durationMinutes: z.number().int().positive().optional(),
  recurrence: z.string().max(200).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: prioritySchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  parentId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
  labelIds: z.array(z.uuid()).optional(),
  position: z.number().int().min(0).optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

/** Body for updating a task. All fields optional; null clears `dueDate`/`parentId`. */
export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10_000).nullable().optional(),
  assignee: z.string().max(200).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  deadline: dateOnlySchema.nullable().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  recurrence: z.string().max(200).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: prioritySchema.optional(),
  progress: z.number().int().min(0).max(100).optional(),
  parentId: z.uuid().nullable().optional(),
  projectId: z.uuid().nullable().optional(),
  sectionId: z.uuid().nullable().optional(),
  labelIds: z.array(z.uuid()).optional(),
  position: z.number().int().min(0).optional(),
});
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const taskListQuerySchema = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  priority: prioritySchema.optional(),
  assignee: z.string().optional(),
  parentId: z.uuid().optional(),
  projectId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
  labelId: z.uuid().optional(),
  // Date filters (drive the Today / Upcoming / overdue views).
  dueBefore: z.coerce.date().optional(),
  dueAfter: z.coerce.date().optional(),
  overdue: boolish.optional(),
  noDate: boolish.optional(),
  /** true → only completed, false → only open (excludes done & cancelled). */
  completed: boolish.optional(),
  root: boolish.optional(),
  tree: boolish.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TaskListQuery = z.infer<typeof taskListQuerySchema>;

export const taskSearchSchema = z.object({
  query: z.string().min(1),
  k: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(TASK_STATUSES).optional(),
});
export type TaskSearchInput = z.infer<typeof taskSearchSchema>;

export const taskQuickAddSchema = z.object({
  text: z.string().min(1).max(1000),
  /** Caller timezone offset, minutes east of UTC (e.g. +120 for UTC+2). */
  tz: z.number().int().min(-840).max(840).optional(),
});
export type TaskQuickAddInput = z.infer<typeof taskQuickAddSchema>;

export const taskAskSchema = z.object({
  question: z.string().min(1),
  k: z.coerce.number().int().min(1).max(20).default(8),
  /** Restrict the note-page side of the RAG to these notebooks. */
  notebookIds: z.array(z.uuid()).optional(),
});
export type TaskAskInput = z.infer<typeof taskAskSchema>;

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
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A task with its nested sub-tasks (used by `tree=true` listings). */
export interface TaskTree extends Task {
  children: TaskTree[];
}

export interface TaskSearchHit extends Task {
  score: number;
}

export interface TaskAskResult {
  answer: string;
  sources: Task[];
  /** RAG-enabled note pages that informed the answer. */
  noteSources?: { id: string; title: string; notebookId: string }[];
}

/** Text used to embed a task for semantic search. */
export function taskEmbeddingText(t: Pick<Task, 'title' | 'description' | 'assignee'>): string {
  return [t.title, t.description, t.assignee].filter(Boolean).join('\n');
}
