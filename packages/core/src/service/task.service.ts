import {
  taskEmbeddingText,
  type Task,
  type TaskCreateInput,
  type TaskListQuery,
  type TaskSearchHit,
  type TaskSearchInput,
  type TaskTree,
  type TaskUpdateInput,
} from '../domain/task.js';
import {
  compileFilter,
  FilterError,
  parseFilter,
  referencedNames,
} from '../domain/filter-query.js';
import { parseQuickAdd, type QuickAddParse } from '../domain/quickadd.js';
import { nextOccurrence, normalizeRecurrence, parseRecurrence } from '../domain/recurrence.js';
import * as attachmentRepo from '../repository/attachment.repo.js';
import * as karma from './karma.service.js';

/** Embed a task's text plus its attachment content (for RAG over attachments). */
async function embedTaskWithAttachments(
  taskId: string,
  fields: Parameters<typeof taskEmbeddingText>[0],
): Promise<number[] | null> {
  const base = taskEmbeddingText(fields);
  const attach = await attachmentRepo.textForTask(taskId);
  return safeEmbed(attach ? `${base}\n${attach}` : base);
}

/** Recompute a task's embedding from its fields and current attachments. */
export async function reembedTask(userId: string, taskId: string): Promise<void> {
  const task = await repo.getById(userId, taskId);
  if (!task) return;
  const embedding = await embedTaskWithAttachments(taskId, {
    title: task.title,
    description: task.description,
    assignee: task.assignee,
  });
  await repo.update(userId, taskId, {}, embedding);
}
import { embedOne } from '../embeddings/provider.js';
import { BadRequest, NotFound } from '../errors.js';
import * as labelRepo from '../repository/label.repo.js';
import * as projectRepo from '../repository/project.repo.js';
import * as sectionRepo from '../repository/section.repo.js';
import * as repo from '../repository/task.repo.js';

/** Validate that every id in `labelIds` is a label the user owns. */
async function assertLabelsOwned(userId: string, labelIds: string[]): Promise<void> {
  const owned = await labelRepo.ownedIds(userId, labelIds);
  if (owned.length !== new Set(labelIds).size) {
    throw BadRequest('labelIds contains an unknown label');
  }
}

/** Fill `labelIds` on a batch of tasks (mutates in place) and return them. */
async function attachLabels<T extends Task>(tasks: T[]): Promise<T[]> {
  const map = await repo.labelsByTask(tasks.map((t) => t.id));
  for (const t of tasks) t.labelIds = map.get(t.id) ?? [];
  return tasks;
}

/** Validate that a section exists and belongs to the given project. */
async function assertSectionInProject(
  userId: string,
  sectionId: string,
  projectId: string,
): Promise<void> {
  const section = await sectionRepo.getById(userId, sectionId);
  if (!section) throw BadRequest('sectionId does not reference an existing section');
  if (section.projectId !== projectId) {
    throw BadRequest('sectionId belongs to a different project');
  }
}

/**
 * Embed text, but never let an embedding failure (e.g. a missing cloud API key)
 * block a write — the task is stored without a vector and simply won't appear in
 * semantic search until re-embedded.
 */
async function safeEmbed(text: string): Promise<number[] | null> {
  if (!text.trim()) return null;
  try {
    const vec = await embedOne(text);
    return vec.length ? vec : null;
  } catch (err) {
    console.error('[embed] skipped (provider error):', err);
    return null;
  }
}

function groupByParent(tasks: Task[]): Map<string | null, Task[]> {
  const byParent = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const list = byParent.get(t.parentId);
    if (list) list.push(t);
    else byParent.set(t.parentId, [t]);
  }
  return byParent;
}

function attach(task: Task, byParent: Map<string | null, Task[]>): TaskTree {
  return { ...task, children: (byParent.get(task.id) ?? []).map((c) => attach(c, byParent)) };
}

export async function createTask(userId: string, input: TaskCreateInput): Promise<Task> {
  let parent: Task | null = null;
  if (input.parentId) {
    parent = await repo.getById(userId, input.parentId);
    if (!parent) throw BadRequest('parentId does not reference an existing task');
  }

  // Resolve the project: an explicit one (validated), else the parent's project
  // for a sub-task, else the user's Inbox.
  let projectId: string;
  if (input.projectId) {
    const project = await projectRepo.getById(userId, input.projectId);
    if (!project) throw BadRequest('projectId does not reference an existing project');
    projectId = project.id;
  } else if (parent?.projectId) {
    projectId = parent.projectId;
  } else {
    projectId = (await projectRepo.ensureInbox(userId)).id;
  }
  if (input.sectionId) await assertSectionInProject(userId, input.sectionId, projectId);
  if (input.labelIds) await assertLabelsOwned(userId, input.labelIds);

  let recurrence: string | null = null;
  if (input.recurrence !== undefined) {
    recurrence = normalizeRecurrence(input.recurrence);
    if (!recurrence) throw BadRequest('Unrecognised recurrence rule');
  }

  const embedding = await safeEmbed(
    taskEmbeddingText({
      title: input.title,
      description: input.description ?? null,
      assignee: input.assignee ?? null,
    }),
  );
  const created = await repo.insert(
    userId,
    {
      title: input.title,
      description: input.description ?? null,
      assignee: input.assignee ?? null,
      dueDate: input.dueDate ?? null,
      deadline: input.deadline ?? null,
      durationMinutes: input.durationMinutes ?? null,
      recurrence,
      status: input.status,
      priority: input.priority,
      progress: input.progress,
      parentId: input.parentId ?? null,
      projectId,
      sectionId: input.sectionId ?? null,
      position: input.position,
    },
    embedding,
  );
  if (input.labelIds?.length) await repo.setTaskLabels(created.id, input.labelIds);
  return (await attachLabels([created]))[0]!;
}

export async function getTask(
  userId: string,
  id: string,
  opts: { withChildren?: boolean } = {},
): Promise<Task | TaskTree> {
  const task = await repo.getById(userId, id);
  if (!task) throw NotFound('Task not found');
  if (!opts.withChildren) return (await attachLabels([task]))[0]!;
  const all = await attachLabels(await repo.listAll(userId));
  // Use the enriched copy of the root so it carries its labels too.
  const enrichedRoot = all.find((t) => t.id === task.id) ?? task;
  return attach(enrichedRoot, groupByParent(all));
}

export async function listTasks(
  userId: string,
  q: TaskListQuery,
): Promise<Task[] | TaskTree[]> {
  if (q.tree) {
    const byParent = groupByParent(await attachLabels(await repo.listAll(userId)));
    const roots = byParent.get(q.parentId ?? null) ?? [];
    return roots.map((t) => attach(t, byParent));
  }
  return attachLabels(await repo.list(userId, q));
}

export async function updateTask(
  userId: string,
  id: string,
  patch: TaskUpdateInput,
): Promise<Task> {
  const existing = await repo.getById(userId, id);
  if (!existing) throw NotFound('Task not found');

  // Re-parenting: validate and guard against cycles.
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw BadRequest('A task cannot be its own parent');
    const parent = await repo.getById(userId, patch.parentId);
    if (!parent) throw BadRequest('parentId does not reference an existing task');
    const descendants = await repo.descendantIds(userId, id);
    if (descendants.includes(patch.parentId)) {
      throw BadRequest('Cannot move a task under one of its own descendants');
    }
  }

  // Resolve project/section moves. `next` carries the effective patch with any
  // null projectId rewritten to the Inbox id.
  const next: TaskUpdateInput = { ...patch };
  let targetProject = existing.projectId;
  if (patch.projectId !== undefined) {
    if (patch.projectId === null) {
      targetProject = (await projectRepo.ensureInbox(userId)).id;
    } else {
      const project = await projectRepo.getById(userId, patch.projectId);
      if (!project) throw BadRequest('projectId does not reference an existing project');
      targetProject = project.id;
    }
    next.projectId = targetProject;
    // Moving to another project drops a section unless a new one is given.
    if (targetProject !== existing.projectId && patch.sectionId === undefined) {
      next.sectionId = null;
    }
  }
  if (next.sectionId !== undefined && next.sectionId !== null) {
    if (!targetProject) throw BadRequest('Cannot set a section on a task with no project');
    await assertSectionInProject(userId, next.sectionId, targetProject);
  }

  // Re-embed only when an embedded field changes (attachment text included).
  let embedding: number[] | null | undefined;
  if (patch.title !== undefined || patch.description !== undefined || patch.assignee !== undefined) {
    embedding = await embedTaskWithAttachments(id, {
      title: patch.title ?? existing.title,
      description: patch.description !== undefined ? patch.description : existing.description,
      assignee: patch.assignee !== undefined ? patch.assignee : existing.assignee,
    });
  }

  if (patch.labelIds !== undefined) {
    await assertLabelsOwned(userId, patch.labelIds);
  }

  // Normalise a new recurrence rule (null clears it).
  if (patch.recurrence !== undefined && patch.recurrence !== null) {
    const canonical = normalizeRecurrence(patch.recurrence);
    if (!canonical) throw BadRequest('Unrecognised recurrence rule');
    next.recurrence = canonical;
  }

  // Completing a recurring task reschedules it to the next occurrence rather
  // than marking it done (Todoist behaviour).
  let recurringReschedule = false;
  if (patch.status === 'done' && existing.recurrence && existing.dueDate) {
    const rule = parseRecurrence(existing.recurrence);
    if (rule) {
      next.status = 'todo';
      next.dueDate = nextOccurrence(rule, new Date(existing.dueDate));
      recurringReschedule = true;
    }
  }

  // Track the completion timestamp and award karma on the open→done transition.
  const wasDone = existing.status === 'done';
  const becomesDone = next.status === 'done';
  let completedAt: Date | null | undefined;
  if (!wasDone && (becomesDone || recurringReschedule)) {
    if (becomesDone) completedAt = new Date();
    await karma.awardForCompletion(userId, existing.priority);
  } else if (wasDone && next.status !== undefined && !becomesDone) {
    completedAt = null; // re-opened
  }

  const updated = await repo.update(userId, id, next, embedding, completedAt);
  if (!updated) throw NotFound('Task not found');
  if (patch.labelIds !== undefined) await repo.setTaskLabels(updated.id, patch.labelIds);
  return (await attachLabels([updated]))[0]!;
}

export async function deleteTask(userId: string, id: string): Promise<void> {
  if (!(await repo.remove(userId, id))) throw NotFound('Task not found');
}

export async function searchTasks(
  userId: string,
  input: TaskSearchInput,
): Promise<TaskSearchHit[]> {
  const vec = await embedOne(input.query);
  if (vec.length === 0) return [];
  return attachLabels(await repo.search(userId, vec, input.k, input.status));
}

/** Preview of a Quick Add line, with the project/label names it would resolve. */
export interface QuickAddPreview extends QuickAddParse {
  projectId: string | null;
  labelIds: string[];
  newLabelNames: string[];
}

/** Resolve a parsed Quick Add line against the user's projects/labels. */
async function resolveQuickAdd(userId: string, parsed: QuickAddParse): Promise<QuickAddPreview> {
  let projectId: string | null = null;
  if (parsed.projectName) {
    const project = await projectRepo.findByName(userId, parsed.projectName);
    projectId = project?.id ?? null;
  }
  const labelIds: string[] = [];
  const newLabelNames: string[] = [];
  for (const name of parsed.labelNames) {
    const existing = await labelRepo.findByName(userId, name);
    if (existing) labelIds.push(existing.id);
    else newLabelNames.push(name);
  }
  return { ...parsed, projectId, labelIds, newLabelNames };
}

export async function previewQuickAdd(userId: string, text: string): Promise<QuickAddPreview> {
  return resolveQuickAdd(userId, parseQuickAdd(text));
}

/** Run a Todoist-style filter query and return the matching tasks (with labels). */
export async function runFilterQuery(userId: string, query: string): Promise<Task[]> {
  let ast;
  try {
    ast = parseFilter(query);
  } catch (err) {
    if (err instanceof FilterError) throw BadRequest(`Invalid filter: ${err.message}`);
    throw err;
  }
  const { labels, projects } = referencedNames(ast);
  const labelIds = new Map<string, string>();
  for (const name of labels) {
    const l = await labelRepo.findByName(userId, name);
    if (l) labelIds.set(name.toLowerCase(), l.id);
  }
  const projectIds = new Map<string, string>();
  for (const name of projects) {
    const p = await projectRepo.findByName(userId, name);
    if (p) projectIds.set(name.toLowerCase(), p.id);
  }
  const { sql, params } = compileFilter(ast, { labelIds, projectIds }, 2);
  return attachLabels(await repo.listByPredicate(userId, sql, params));
}

/** Parse a Quick Add line and create the task, creating any missing labels. */
export async function quickAddTask(userId: string, text: string): Promise<Task> {
  const parsed = parseQuickAdd(text);
  if (!parsed.title) throw BadRequest('Quick add produced an empty title');

  let projectId: string | undefined;
  if (parsed.projectName) {
    const project = await projectRepo.findByName(userId, parsed.projectName);
    if (project) projectId = project.id;
  }

  const labelIds: string[] = [];
  for (const name of parsed.labelNames) {
    const existing =
      (await labelRepo.findByName(userId, name)) ?? (await labelRepo.insert(userId, name, null));
    labelIds.push(existing.id);
  }

  return createTask(userId, {
    title: parsed.title,
    projectId,
    dueDate: parsed.dueDate ?? undefined,
    priority: parsed.priority ?? undefined,
    recurrence: parsed.recurrence ?? undefined,
    labelIds: labelIds.length ? labelIds : undefined,
  });
}
