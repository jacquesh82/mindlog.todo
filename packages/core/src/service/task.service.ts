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
  if (input.parentId) {
    const parent = await repo.getById(userId, input.parentId);
    if (!parent) throw BadRequest('parentId does not reference an existing task');
  }

  // Resolve the project: an explicit one (validated) or the user's Inbox.
  let projectId: string;
  if (input.projectId) {
    const project = await projectRepo.getById(userId, input.projectId);
    if (!project) throw BadRequest('projectId does not reference an existing project');
    projectId = project.id;
  } else {
    projectId = (await projectRepo.ensureInbox(userId)).id;
  }
  if (input.sectionId) await assertSectionInProject(userId, input.sectionId, projectId);
  if (input.labelIds) await assertLabelsOwned(userId, input.labelIds);

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

  // Re-embed only when an embedded field changes.
  let embedding: number[] | null | undefined;
  if (patch.title !== undefined || patch.description !== undefined || patch.assignee !== undefined) {
    embedding = await safeEmbed(
      taskEmbeddingText({
        title: patch.title ?? existing.title,
        description: patch.description !== undefined ? patch.description : existing.description,
        assignee: patch.assignee !== undefined ? patch.assignee : existing.assignee,
      }),
    );
  }

  if (patch.labelIds !== undefined) {
    await assertLabelsOwned(userId, patch.labelIds);
  }

  const updated = await repo.update(userId, id, next, embedding);
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
